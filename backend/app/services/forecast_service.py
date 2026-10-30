from collections import deque
from datetime import date, timedelta
from typing import Dict, List, Optional, Tuple, Set
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend.app.models.project import Project
from backend.app.models.task import Task
from backend.app.models.dependency import TaskDependency
from backend.app.algorithms.cpm import calculate_cpm, CPMScheduleResult
from backend.app.algorithms.forecast import (
    estimate_remaining_duration,
    run_what_if_simulation,
    SimulationAnalysisResult,
    ForecastEstimationError,
)
from backend.app.schemas.forecast import (
    TaskForecastItem,
    ProjectForecastResponse,
    TaskDelayImpactResponse,
)
from backend.app.schemas.simulation import (
    WhatIfSimulationRequest,
    WhatIfSimulationResponse,
    SimulatedTaskImpact,
)
from backend.app.services.scheduling_service import get_project_schedule


def compute_project_forecast(
    db: Session,
    project_id: int,
    as_of_date: Optional[date] = None
) -> ProjectForecastResponse:
    """
    Computes deterministic remaining work and completion forecast via CPM.
    Uses Earned Duration: Remaining = Baseline Duration * (100 - Actual Progress) / 100.
    Preserves the original baseline schedule and does not modify task records.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with ID {project_id} not found"
        )

    if as_of_date is None:
        as_of_date = date.today()

    tasks: List[Task] = db.query(Task).filter(Task.project_id == project_id).all()
    dependencies: List[TaskDependency] = db.query(TaskDependency).filter(
        TaskDependency.project_id == project_id
    ).all()

    # Get baseline schedule for comparison
    base_schedule = get_project_schedule(db=db, project_id=project_id, use_pert=False)
    baseline_duration = base_schedule.total_duration

    if not tasks:
        return ProjectForecastResponse(
            project_id=project.id,
            project_name=project.name,
            as_of_date=as_of_date,
            baseline_duration=0.0,
            forecast_remaining_duration=0.0,
            forecast_total_duration=0.0,
            duration_variance=0.0,
            project_start_date=project.start_date,
            forecast_completion_date=project.start_date,
            critical_path=[],
            tasks=[]
        )

    # 1. Calculate remaining durations for each task
    remaining_tasks: Dict[int, Tuple[str, float]] = {}
    remaining_duration_map: Dict[int, float] = {}

    for task in tasks:
        rem_dur = estimate_remaining_duration(float(task.duration), task.progress)
        remaining_tasks[task.id] = (task.name, rem_dur)
        remaining_duration_map[task.id] = rem_dur

    deps_list: List[Tuple[int, int]] = [(d.task_id, d.depends_on_id) for d in dependencies]

    # 2. Run CPM on remaining durations
    forecast_cpm = calculate_cpm(tasks=remaining_tasks, dependencies=deps_list)
    remaining_duration = forecast_cpm.total_duration

    # 3. Calculate forecast total duration and calendar dates if project start date exists
    elapsed_days = 0.0
    forecast_completion_date = None

    if project.start_date:
        if as_of_date >= project.start_date:
            elapsed_days = float((as_of_date - project.start_date).days)
        forecast_completion_date = as_of_date + timedelta(days=round(remaining_duration))

    forecast_total_duration = round(elapsed_days + remaining_duration, 2)
    duration_variance = round(forecast_total_duration - baseline_duration, 2)

    task_items: List[TaskForecastItem] = []
    for tid, node in sorted(forecast_cpm.tasks.items(), key=lambda x: x[0]):
        task_model = next(t for t in tasks if t.id == tid)
        forecast_start_d = None
        forecast_finish_d = None
        if as_of_date:
            forecast_start_d = as_of_date + timedelta(days=round(node.early_start))
            forecast_finish_d = as_of_date + timedelta(days=round(node.early_finish))

        task_items.append(TaskForecastItem(
            task_id=tid,
            task_name=node.name,
            baseline_duration=float(task_model.duration),
            actual_progress=task_model.progress,
            remaining_duration=node.duration,
            forecast_early_start=node.early_start,
            forecast_early_finish=node.early_finish,
            forecast_late_start=node.late_start,
            forecast_late_finish=node.late_finish,
            slack=node.slack,
            is_critical=node.is_critical,
            forecast_start_date=forecast_start_d,
            forecast_finish_date=forecast_finish_d
        ))

    return ProjectForecastResponse(
        project_id=project.id,
        project_name=project.name,
        as_of_date=as_of_date,
        baseline_duration=baseline_duration,
        forecast_remaining_duration=remaining_duration,
        forecast_total_duration=forecast_total_duration,
        duration_variance=duration_variance,
        project_start_date=project.start_date,
        forecast_completion_date=forecast_completion_date,
        critical_path=forecast_cpm.critical_path,
        tasks=task_items
    )


def analyze_task_delay_impact(
    db: Session,
    project_id: int,
    task_id: int,
    delay_days: Optional[float] = None
) -> TaskDelayImpactResponse:
    """
    Evaluates the impact of a task delay on downstream activities, float consumption,
    and project completion date.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with ID {project_id} not found"
        )

    task = db.query(Task).filter(Task.id == task_id, Task.project_id == project_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with ID {task_id} not found in project {project_id}"
        )

    tasks: List[Task] = db.query(Task).filter(Task.project_id == project_id).all()
    dependencies: List[TaskDependency] = db.query(TaskDependency).filter(
        TaskDependency.project_id == project_id
    ).all()

    # Determine delay amount: explicit param or default
    eff_delay = float(delay_days) if delay_days is not None else 0.0
    if eff_delay < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Delay cannot be negative"
        )

    # Find downstream reachable tasks via BFS
    successors_map: Dict[int, List[int]] = {t.id: [] for t in tasks}
    for d in dependencies:
        successors_map[d.depends_on_id].append(d.task_id)

    downstream_ids: Set[int] = set()
    queue = deque(successors_map.get(task_id, []))
    while queue:
        curr = queue.popleft()
        if curr not in downstream_ids:
            downstream_ids.add(curr)
            for succ in successors_map.get(curr, []):
                if succ not in downstream_ids:
                    queue.append(succ)

    # Run simulation
    tasks_dict = {t.id: (t.name, float(t.duration)) for t in tasks}
    deps_list = [(d.task_id, d.depends_on_id) for d in dependencies]

    sim_res = run_what_if_simulation(
        tasks=tasks_dict,
        dependencies=deps_list,
        hypothetical_delays={task_id: eff_delay}
    )

    base_schedule = get_project_schedule(db=db, project_id=project_id, use_pert=False)
    task_sched = next((item for item in base_schedule.tasks if item.task_id == task_id), None)
    available_slack = task_sched.slack if task_sched else 0.0

    slack_consumed = round(min(eff_delay, available_slack), 2)
    project_impact = round(max(0.0, eff_delay - available_slack), 2)

    # Downstream affected tasks: reachable downstream tasks whose early start changed
    affected_downstream = [
        tid for tid in sim_res.affected_task_ids
        if tid in downstream_ids
    ]

    return TaskDelayImpactResponse(
        task_id=task.id,
        task_name=task.name,
        project_id=project_id,
        is_behind_schedule=(eff_delay > available_slack),
        delay_days=eff_delay,
        available_slack=available_slack,
        slack_consumed=slack_consumed,
        project_completion_impact=project_impact,
        downstream_affected_task_ids=sorted(affected_downstream),
        critical_path_changed=sim_res.critical_path_changed,
        original_critical_path=sim_res.original_critical_path,
        simulated_critical_path=sim_res.simulated_critical_path
    )


def simulate_project_delays(
    db: Session,
    project_id: int,
    simulation_req: WhatIfSimulationRequest
) -> WhatIfSimulationResponse:
    """
    Executes a read-only multi-task hypothetical delay simulation.
    Validates task project ownership, prevents negative delays, and does not alter database state.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with ID {project_id} not found"
        )

    tasks: List[Task] = db.query(Task).filter(Task.project_id == project_id).all()
    project_task_ids = {t.id for t in tasks}
    dependencies: List[TaskDependency] = db.query(TaskDependency).filter(
        TaskDependency.project_id == project_id
    ).all()

    # Validate task ownership and delays
    delays_map: Dict[int, float] = {}
    for d in simulation_req.delays:
        if d.task_id not in project_task_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Task {d.task_id} does not belong to project {project_id}"
            )
        if d.delay_days < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Delay cannot be negative for task {d.task_id}"
            )
        delays_map[d.task_id] = float(d.delay_days)

    # Base task durations
    tasks_dict: Dict[int, Tuple[str, float]] = {}
    for t in tasks:
        dur = float(t.duration)
        if simulation_req.use_pert and t.optimistic_duration and t.most_likely_duration and t.pessimistic_duration:
            dur = (t.optimistic_duration + 4.0 * t.most_likely_duration + t.pessimistic_duration) / 6.0
        tasks_dict[t.id] = (t.name, dur)

    deps_list = [(d.task_id, d.depends_on_id) for d in dependencies]

    try:
        sim_analysis = run_what_if_simulation(
            tasks=tasks_dict,
            dependencies=deps_list,
            hypothetical_delays=delays_map
        )
    except ForecastEstimationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    impact_items: List[SimulatedTaskImpact] = [
        SimulatedTaskImpact(
            task_id=res.task_id,
            task_name=res.task_name,
            original_duration=res.original_duration,
            simulated_duration=res.simulated_duration,
            original_early_start=res.original_early_start,
            original_early_finish=res.original_early_finish,
            simulated_early_start=res.simulated_early_start,
            simulated_early_finish=res.simulated_early_finish,
            start_delay=res.start_delay,
            finish_delay=res.finish_delay,
            slack_consumed=res.slack_consumed,
            new_slack=res.new_slack,
            is_critical=res.is_critical
        )
        for res in sim_analysis.task_results
    ]

    return WhatIfSimulationResponse(
        project_id=project_id,
        baseline_duration=sim_analysis.baseline_duration,
        simulated_duration=sim_analysis.simulated_duration,
        project_delay=sim_analysis.project_delay,
        critical_path_changed=sim_analysis.critical_path_changed,
        original_critical_path=sim_analysis.original_critical_path,
        simulated_critical_path=sim_analysis.simulated_critical_path,
        simulated_critical_task_ids=sim_analysis.simulated_critical_task_ids,
        affected_task_ids=sim_analysis.affected_task_ids,
        task_impacts=impact_items
    )
