from datetime import date
from typing import List, Optional
from sqlalchemy.orm import Session
from backend.app.models.task import Task
from backend.app.schemas.task import TaskCreate, TaskUpdate, TaskResponse
from backend.app.services.scheduling_service import invalidate_project_schedule


def get_task(db: Session, task_id: int) -> Optional[Task]:
    return db.query(Task).filter(Task.id == task_id).first()


def get_tasks(
    db: Session,
    project_id: Optional[int] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100
) -> List[Task]:
    query = db.query(Task)
    if project_id is not None:
        query = query.filter(Task.project_id == project_id)
    if status:
        query = query.filter(Task.status == status)
    if priority:
        query = query.filter(Task.priority == priority)
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            (Task.name.ilike(search_pattern)) |
            (Task.description.ilike(search_pattern)) |
            (Task.assignee.ilike(search_pattern))
        )
    return query.order_by(Task.id.asc()).offset(skip).limit(limit).all()


def create_task(db: Session, task_in: TaskCreate) -> Task:
    act_start = task_in.actual_start_date
    act_end = task_in.actual_end_date

    # Auto-record actual dates when work begins or completes if not explicitly passed
    if act_start is None and (task_in.progress > 0 or task_in.status == "In Progress"):
        act_start = date.today()
    if act_end is None and (task_in.progress >= 100 or task_in.status == "Done"):
        act_end = date.today()
        if act_start is None:
            act_start = act_end

    db_task = Task(
        project_id=task_in.project_id,
        name=task_in.name,
        description=task_in.description,
        duration=task_in.duration,
        optimistic_duration=task_in.optimistic_duration,
        most_likely_duration=task_in.most_likely_duration,
        pessimistic_duration=task_in.pessimistic_duration,
        start_date=task_in.start_date,
        end_date=task_in.end_date,
        actual_start_date=act_start,
        actual_end_date=act_end,
        status=task_in.status,
        priority=task_in.priority,
        progress=task_in.progress,
        assignee=task_in.assignee,
    )
    db.add(db_task)
    db.commit()
    db.refresh(db_task)

    # Invalidate cached schedule for project
    invalidate_project_schedule(db, task_in.project_id)
    return db_task


def update_task(db: Session, db_task: Task, task_in: TaskUpdate) -> Task:
    old_project_id = db_task.project_id
    update_data = task_in.model_dump(exclude_unset=True)

    # Validate and auto-align status/progress
    if "progress" in update_data and "status" not in update_data:
        if update_data["progress"] == 100:
            update_data["status"] = "Done"
        elif update_data["progress"] > 0:
            update_data["status"] = "In Progress"
        else:
            update_data["status"] = "To Do"
    elif "status" in update_data and "progress" not in update_data:
        if update_data["status"] == "Done":
            update_data["progress"] = 100
        elif update_data["status"] == "To Do":
            update_data["progress"] = 0
    else:
        new_status = update_data.get("status", db_task.status)
        new_progress = update_data.get("progress", db_task.progress)
        if new_status == "Done" and new_progress < 100:
            raise ValueError("Task with status 'Done' must have 100% progress")
        if new_status == "To Do" and new_progress == 100:
            raise ValueError("Task with status 'To Do' cannot have 100% progress")

    # Validate cross-field dates and PERT triplet with existing values if partially updated
    eff_start = update_data.get("start_date", db_task.start_date)
    eff_end = update_data.get("end_date", db_task.end_date)
    if eff_start and eff_end and eff_end < eff_start:
        raise ValueError("Task end date cannot be earlier than start date")

    eff_act_start = update_data.get("actual_start_date", db_task.actual_start_date)
    eff_act_end = update_data.get("actual_end_date", db_task.actual_end_date)
    if eff_act_start and eff_act_end and eff_act_end < eff_act_start:
        raise ValueError("Actual completion date cannot be earlier than actual start date")

    eff_o = update_data.get("optimistic_duration", db_task.optimistic_duration)
    eff_m = update_data.get("most_likely_duration", db_task.most_likely_duration)
    eff_p = update_data.get("pessimistic_duration", db_task.pessimistic_duration)
    if eff_o is not None and eff_m is not None and eff_o > eff_m:
        raise ValueError(f"Optimistic duration ({eff_o}) cannot exceed most likely duration ({eff_m})")
    if eff_m is not None and eff_p is not None and eff_m > eff_p:
        raise ValueError(f"Most likely duration ({eff_m}) cannot exceed pessimistic duration ({eff_p})")
    if eff_o is not None and eff_p is not None and eff_o > eff_p:
        raise ValueError(f"Optimistic duration ({eff_o}) cannot exceed pessimistic duration ({eff_p})")

    for field, value in update_data.items():
        setattr(db_task, field, value)

    # Auto-manage actual dates if not explicitly provided in update_data
    if "actual_start_date" not in update_data:
        if db_task.progress > 0 or db_task.status in ("In Progress", "Done"):
            if db_task.actual_start_date is None:
                db_task.actual_start_date = date.today()
        else:
            db_task.actual_start_date = None

    if "actual_end_date" not in update_data:
        if db_task.progress >= 100 or db_task.status == "Done":
            if db_task.actual_end_date is None:
                db_task.actual_end_date = date.today()
            if db_task.actual_start_date is None:
                db_task.actual_start_date = db_task.actual_end_date
        else:
            db_task.actual_end_date = None

    db.commit()
    db.refresh(db_task)

    # Invalidate cached schedule for project(s)
    invalidate_project_schedule(db, old_project_id)
    if db_task.project_id != old_project_id:
        invalidate_project_schedule(db, db_task.project_id)

    return db_task


def delete_task(db: Session, db_task: Task) -> None:
    project_id = db_task.project_id
    db.delete(db_task)
    db.commit()

    # Invalidate cached schedule for project
    invalidate_project_schedule(db, project_id)


def to_task_response(task: Task) -> TaskResponse:
    dep_ids = [dep.depends_on_id for dep in task.dependencies] if task.dependencies else []
    return TaskResponse(
        id=task.id,
        project_id=task.project_id,
        name=task.name,
        description=task.description,
        duration=task.duration,
        optimistic_duration=task.optimistic_duration,
        most_likely_duration=task.most_likely_duration,
        pessimistic_duration=task.pessimistic_duration,
        start_date=task.start_date,
        end_date=task.end_date,
        actual_start_date=task.actual_start_date,
        actual_end_date=task.actual_end_date,
        status=task.status,
        priority=task.priority,
        progress=task.progress,
        assignee=task.assignee,
        created_at=task.created_at,
        updated_at=task.updated_at,
        dependencies=dep_ids,
    )
