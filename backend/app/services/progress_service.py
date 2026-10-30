from datetime import date, timedelta
from typing import Optional, List, Dict
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend.app.models.project import Project
from backend.app.models.task import Task
from backend.app.schemas.progress import TaskProgressItem, ProjectProgressSummary
from backend.app.algorithms.progress import calculate_task_planned_progress, classify_task_progress
from backend.app.services.scheduling_service import get_project_schedule


def get_project_progress(
    db: Session,
    project_id: int,
    as_of_date: Optional[date] = None
) -> ProjectProgressSummary:
    """
    Computes planned vs actual progress comparison and classification as of a reference date.
    Uses the baseline CPM schedule and project start date for calendar mapping.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with ID {project_id} not found"
        )

    if as_of_date is None:
        as_of_date = date.today()

    if project.start_date is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot calculate calendar planned progress: project start date is not configured."
        )

    tasks: List[Task] = db.query(Task).filter(Task.project_id == project_id).all()
    if not tasks:
        return ProjectProgressSummary(
            project_id=project.id,
            project_name=project.name,
            as_of_date=as_of_date,
            total_tasks=0,
            completed_tasks=0,
            in_progress_tasks=0,
            not_started_tasks=0,
            overall_planned_progress=0.0,
            overall_actual_progress=0.0,
            overall_variance=0.0,
            project_health="On schedule",
            tasks=[]
        )

    # Obtain baseline CPM schedule for early start / early finish offsets
    schedule = get_project_schedule(db=db, project_id=project_id, use_pert=False)
    schedule_map = {item.task_id: item for item in schedule.tasks}

    task_items: List[TaskProgressItem] = []
    total_duration_weight = 0.0
    weighted_planned = 0.0
    weighted_actual = 0.0

    completed_count = 0
    in_progress_count = 0
    not_started_count = 0

    for task in tasks:
        dur = float(task.duration)
        sched_node = schedule_map.get(task.id)

        if sched_node:
            planned_start = project.start_date + timedelta(days=round(sched_node.early_start))
            planned_end = project.start_date + timedelta(days=round(sched_node.early_finish))
        else:
            planned_start = task.start_date or project.start_date
            planned_end = task.end_date or planned_start + timedelta(days=task.duration)

        # Calculate planned progress percentage
        planned_pct = calculate_task_planned_progress(
            planned_start=planned_start,
            planned_end=planned_end,
            as_of=as_of_date,
            duration=dur
        )

        actual_pct = float(task.progress)
        variance, status_label = classify_task_progress(
            actual_progress=actual_pct,
            planned_progress=planned_pct,
            status=task.status
        )

        if status_label == "Completed":
            completed_count += 1
        elif status_label == "Not started":
            not_started_count += 1
        else:
            in_progress_count += 1

        total_duration_weight += dur
        weighted_planned += dur * planned_pct
        weighted_actual += dur * actual_pct

        task_items.append(TaskProgressItem(
            task_id=task.id,
            task_name=task.name,
            status=task.status,
            planned_progress=planned_pct,
            actual_progress=actual_pct,
            variance=variance,
            status_label=status_label,
            planned_start_date=planned_start,
            planned_end_date=planned_end,
            actual_start_date=task.actual_start_date,
            actual_end_date=task.actual_end_date
        ))

    # Sort tasks by task_id
    task_items.sort(key=lambda x: x.task_id)

    if total_duration_weight > 0:
        overall_planned = round(weighted_planned / total_duration_weight, 2)
        overall_actual = round(weighted_actual / total_duration_weight, 2)
    else:
        overall_planned = 0.0
        overall_actual = 0.0

    overall_var = round(overall_actual - overall_planned, 2)

    if overall_var > 0.01:
        project_health = "Ahead of schedule"
    elif abs(overall_var) <= 0.01:
        project_health = "On schedule"
    else:
        project_health = "Behind schedule"

    return ProjectProgressSummary(
        project_id=project.id,
        project_name=project.name,
        as_of_date=as_of_date,
        total_tasks=len(tasks),
        completed_tasks=completed_count,
        in_progress_tasks=in_progress_count,
        not_started_tasks=not_started_count,
        overall_planned_progress=overall_planned,
        overall_actual_progress=overall_actual,
        overall_variance=overall_var,
        project_health=project_health,
        tasks=task_items
    )
