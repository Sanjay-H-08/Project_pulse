from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple, Set
from sqlalchemy.orm import Session

from backend.app.models.project import Project
from backend.app.models.task import Task
from backend.app.models.dependency import TaskDependency
from backend.app.models.schedule import ProjectSchedule
from backend.app.algorithms.cpm import calculate_cpm, CPMScheduleResult, CPMSchedulingError
from backend.app.algorithms.pert import (
    calculate_pert_expected_duration,
    validate_pert_estimates,
    PertCalculationResult,
    PertValidationError,
)
from backend.app.schemas.pert import PertInput, PertEstimate
from backend.app.schemas.schedule import TaskScheduleItem, ProjectScheduleResponse


class SchedulingServiceError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def invalidate_project_schedule(db: Session, project_id: int) -> None:
    """
    Invalidates any cached/persisted schedules for the project.
    Called whenever tasks or dependencies in the project are created, updated, or removed.
    """
    db.query(ProjectSchedule).filter(ProjectSchedule.project_id == project_id).delete()
    db.commit()


def is_schedule_stale(
    record: Optional[ProjectSchedule],
    tasks: List[Task],
    dependencies: List[TaskDependency],
    use_pert: bool
) -> bool:
    """
    Verifies if a persisted schedule record is stale compared to live task/dependency data:
    1. Record does not exist.
    2. Task count or task IDs differ from the stored schedule.
    3. Any task was updated after the schedule calculation timestamp.
    4. Any dependency was created after the schedule calculation timestamp.
    5. Dependency count differs from stored schedule predecessors.
    6. Stored task durations or PERT estimates differ from current task values.
    """
    if record is None:
        return True

    if record.use_pert != use_pert:
        return True

    # Check task IDs
    current_task_ids: Set[int] = {t.id for t in tasks}
    recorded_task_ids: Set[int] = {int(tid) for tid in record.tasks_schedule.keys()}
    if current_task_ids != recorded_task_ids:
        return True

    # Check timestamps (ensure timezone consistency)
    calc_time = record.calculated_at
    if calc_time.tzinfo is None:
        calc_time = calc_time.replace(tzinfo=timezone.utc)

    for task in tasks:
        t_time = task.updated_at
        if t_time.tzinfo is None:
            t_time = t_time.replace(tzinfo=timezone.utc)
        if t_time > calc_time:
            return True

    for dep in dependencies:
        d_time = dep.created_at
        if d_time.tzinfo is None:
            d_time = d_time.replace(tzinfo=timezone.utc)
        if d_time > calc_time:
            return True

    # Check dependency count
    recorded_dep_count = sum(len(item.get("predecessors", [])) for item in record.tasks_schedule.values())
    if recorded_dep_count != len(dependencies):
        return True

    # Check task duration consistency
    for task in tasks:
        item = record.tasks_schedule.get(str(task.id))
        if not item:
            return True

        if not use_pert:
            if abs(float(item.get("duration", 0.0)) - float(task.duration)) > 1e-5:
                return True
        else:
            # If using PERT, check if stored pert_estimate matches current task PERT fields
            stored_pert = item.get("pert_estimate")
            has_task_pert = (
                task.optimistic_duration is not None and
                task.most_likely_duration is not None and
                task.pessimistic_duration is not None
            )
            if has_task_pert != (stored_pert is not None):
                return True
            if has_task_pert and stored_pert:
                if (
                    abs(stored_pert.get("optimistic", 0.0) - float(task.optimistic_duration)) > 1e-5 or
                    abs(stored_pert.get("most_likely", 0.0) - float(task.most_likely_duration)) > 1e-5 or
                    abs(stored_pert.get("pessimistic", 0.0) - float(task.pessimistic_duration)) > 1e-5
                ):
                    return True

    return False


def _build_schedule_response(
    project_id: int,
    project_name: str,
    cpm_result: CPMScheduleResult,
    pert_details: Dict[int, PertEstimate],
    use_pert: bool,
    calculated_at: datetime
) -> ProjectScheduleResponse:
    task_items: List[TaskScheduleItem] = []

    for tid, node in sorted(cpm_result.tasks.items(), key=lambda x: x[0]):
        pert_est = pert_details.get(tid)
        item = TaskScheduleItem(
            task_id=node.task_id,
            task_name=node.name,
            duration=node.duration,
            early_start=node.early_start,
            early_finish=node.early_finish,
            late_start=node.late_start,
            late_finish=node.late_finish,
            slack=node.slack,
            is_critical=node.is_critical,
            predecessors=node.predecessors,
            successors=node.successors,
            pert_estimate=pert_est
        )
        task_items.append(item)

    return ProjectScheduleResponse(
        project_id=project_id,
        project_name=project_name,
        total_duration=cpm_result.total_duration,
        critical_path=cpm_result.critical_path,
        critical_paths=cpm_result.critical_paths,
        critical_path_task_ids=cpm_result.critical_task_ids,
        tasks=task_items,
        use_pert=use_pert,
        calculated_at=calculated_at
    )


def compute_and_save_schedule(
    db: Session,
    project_id: int,
    use_pert: bool = False,
    task_pert_estimates: Optional[Dict[int, PertInput]] = None
) -> ProjectScheduleResponse:
    """
    Computes project schedule via CPM (and optional PERT) and persists the result.
    Does NOT overwrite original task durations in the database.

    PERT Policy:
    1. Complete estimates (O, M, P): Validated (O <= M <= P) and calculated as (O + 4M + P)/6.
    2. Incomplete estimates (partial fields): Rejected with HTTP 400.
    3. No PERT estimates: Uses deterministic baseline task duration.
    4. Invalid estimates (O > M or M > P or negative): Rejected with HTTP 400.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise SchedulingServiceError(f"Project with ID {project_id} not found", status_code=404)

    tasks: List[Task] = db.query(Task).filter(Task.project_id == project_id).all()
    dependencies: List[TaskDependency] = db.query(TaskDependency).filter(
        TaskDependency.project_id == project_id
    ).all()

    now = datetime.now(timezone.utc)

    # Handle empty project edge case
    if not tasks:
        empty_cpm = calculate_cpm(tasks={}, dependencies=[])
        response = _build_schedule_response(
            project_id=project.id,
            project_name=project.name,
            cpm_result=empty_cpm,
            pert_details={},
            use_pert=use_pert,
            calculated_at=now
        )
        _persist_schedule_record(db, project.id, response, use_pert)
        return response

    tasks_dict: Dict[int, Tuple[str, float]] = {}
    pert_details: Dict[int, PertEstimate] = {}

    for task in tasks:
        effective_duration = float(task.duration)

        if use_pert:
            opt = None
            ml = None
            pess = None

            # Priority 1: request payload overrides
            if task_pert_estimates and task.id in task_pert_estimates:
                pert_in = task_pert_estimates[task.id]
                opt = pert_in.optimistic
                ml = pert_in.most_likely
                pess = pert_in.pessimistic
            # Priority 2: task database columns
            else:
                opt = task.optimistic_duration
                ml = task.most_likely_duration
                pess = task.pessimistic_duration

            has_any = (opt is not None) or (ml is not None) or (pess is not None)
            has_all = (opt is not None) and (ml is not None) and (pess is not None)

            # Incomplete PERT estimate check: if user entered partial values, reject!
            if has_any and not has_all:
                raise SchedulingServiceError(
                    f"Incomplete PERT estimates for task {task.id} ('{task.name}'). "
                    f"When specifying PERT estimates, all three values (optimistic, most likely, and pessimistic) "
                    f"must be provided. Received: Optimistic={opt}, Most Likely={ml}, Pessimistic={pess}.",
                    status_code=400
                )

            # Complete PERT estimate: validate and calculate
            if has_all:
                try:
                    pert_res: PertCalculationResult = calculate_pert_expected_duration(opt, ml, pess)
                    effective_duration = pert_res.expected_duration
                    pert_details[task.id] = PertEstimate(
                        optimistic=opt,
                        most_likely=ml,
                        pessimistic=pess,
                        expected_duration=pert_res.expected_duration,
                        variance=pert_res.variance,
                        standard_deviation=pert_res.standard_deviation
                    )
                except PertValidationError as e:
                    raise SchedulingServiceError(
                        f"Invalid PERT estimates for task {task.id} ('{task.name}'): {str(e)}",
                        status_code=400
                    )
            # If not has_any: task has no PERT estimates; falls back to baseline duration

        tasks_dict[task.id] = (task.name, effective_duration)

    deps_list: List[Tuple[int, int]] = [(d.task_id, d.depends_on_id) for d in dependencies]

    try:
        cpm_result = calculate_cpm(tasks=tasks_dict, dependencies=deps_list)
    except CPMSchedulingError as e:
        raise SchedulingServiceError(f"Scheduling calculation failed: {str(e)}", status_code=400)

    response = _build_schedule_response(
        project_id=project.id,
        project_name=project.name,
        cpm_result=cpm_result,
        pert_details=pert_details,
        use_pert=use_pert,
        calculated_at=now
    )

    _persist_schedule_record(db, project.id, response, use_pert)
    return response


def _persist_schedule_record(
    db: Session,
    project_id: int,
    response: ProjectScheduleResponse,
    use_pert: bool
) -> None:
    """
    Updates or inserts the persisted schedule record uniquely keyed by (project_id, use_pert).
    Ensures baseline CPM and PERT schedules are stored separately and cannot overwrite each other.
    """
    record = db.query(ProjectSchedule).filter(
        ProjectSchedule.project_id == project_id,
        ProjectSchedule.use_pert == use_pert
    ).first()

    tasks_schedule_data = {
        str(item.task_id): item.model_dump()
        for item in response.tasks
    }

    if not record:
        record = ProjectSchedule(
            project_id=project_id,
            total_duration=response.total_duration,
            critical_path=response.critical_path,
            critical_paths=response.critical_paths,
            critical_task_ids=response.critical_path_task_ids,
            tasks_schedule=tasks_schedule_data,
            use_pert=use_pert,
            calculated_at=response.calculated_at
        )
        db.add(record)
    else:
        record.total_duration = response.total_duration
        record.critical_path = response.critical_path
        record.critical_paths = response.critical_paths
        record.critical_task_ids = response.critical_path_task_ids
        record.tasks_schedule = tasks_schedule_data
        record.use_pert = use_pert
        record.calculated_at = response.calculated_at

    db.commit()


def get_project_schedule(
    db: Session,
    project_id: int,
    use_pert: bool = False
) -> ProjectScheduleResponse:
    """
    Retrieves the persisted schedule for (project_id, use_pert).
    Guarantees freshness: If no schedule exists or if task/dependency modifications made the
    cached schedule stale, it automatically recalculates, persists, and returns the fresh schedule.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise SchedulingServiceError(f"Project with ID {project_id} not found", status_code=404)

    tasks: List[Task] = db.query(Task).filter(Task.project_id == project_id).all()
    dependencies: List[TaskDependency] = db.query(TaskDependency).filter(
        TaskDependency.project_id == project_id
    ).all()

    record = db.query(ProjectSchedule).filter(
        ProjectSchedule.project_id == project_id,
        ProjectSchedule.use_pert == use_pert
    ).first()

    # Check if cached schedule is stale
    stale = is_schedule_stale(record=record, tasks=tasks, dependencies=dependencies, use_pert=use_pert)

    if not stale and record is not None:
        task_items: List[TaskScheduleItem] = []
        for tid_str, item_dict in record.tasks_schedule.items():
            task_items.append(TaskScheduleItem.model_validate(item_dict))

        task_items.sort(key=lambda x: x.task_id)

        return ProjectScheduleResponse(
            project_id=record.project_id,
            project_name=project.name,
            total_duration=record.total_duration,
            critical_path=record.critical_path,
            critical_paths=record.critical_paths,
            critical_path_task_ids=record.critical_task_ids,
            tasks=task_items,
            use_pert=record.use_pert,
            calculated_at=record.calculated_at
        )

    # Schedule is stale or missing -> compute fresh schedule and save
    return compute_and_save_schedule(db=db, project_id=project_id, use_pert=use_pert)
