from datetime import date, timedelta
from typing import Dict, List, Optional, Tuple, NamedTuple


class TaskProgressComparison(NamedTuple):
    task_id: int
    task_name: str
    planned_progress: float
    actual_progress: float
    variance: float
    status_label: str  # Ahead of schedule, On schedule, Behind schedule, Not started, Completed
    planned_start_date: Optional[date]
    planned_end_date: Optional[date]
    actual_start_date: Optional[date]
    actual_end_date: Optional[date]


class ProjectProgressAnalysis(NamedTuple):
    project_id: int
    as_of_date: date
    total_tasks: int
    completed_tasks: int
    in_progress_tasks: int
    not_started_tasks: int
    overall_planned_progress: float
    overall_actual_progress: float
    overall_variance: float
    project_health: str  # Ahead of schedule, On schedule, Behind schedule
    tasks: List[TaskProgressComparison]


def calculate_task_planned_progress(
    planned_start: date,
    planned_end: date,
    as_of: date,
    duration: float
) -> float:
    """
    Calculates deterministic planned progress as of a given calendar date.

    Assumptions & Conversion:
    - If duration == 0:
        planned progress is 100% if as_of >= planned_start, else 0%.
    - If as_of < planned_start:
        Task has not yet reached its planned start date -> planned progress = 0.0%.
    - If as_of >= planned_end:
        Task should be finished by now according to plan -> planned progress = 100.0%.
    - If planned_start <= as_of < planned_end:
        Linear interpolation across the planned duration window:
        planned_progress = min(100.0, max(0.0, (as_of - planned_start) / (planned_end - planned_start) * 100.0))
    """
    if duration <= 0:
        return 100.0 if as_of >= planned_start else 0.0

    if as_of < planned_start:
        return 0.0
    if as_of >= planned_end:
        return 100.0

    total_days = (planned_end - planned_start).days
    if total_days <= 0:
        return 100.0

    elapsed_days = (as_of - planned_start).days
    fraction = elapsed_days / total_days
    return round(min(100.0, max(0.0, fraction * 100.0)), 2)


def classify_task_progress(
    actual_progress: float,
    planned_progress: float,
    status: str,
    tolerance: float = 0.01
) -> Tuple[float, str]:
    """
    Computes progress variance and classifies task schedule health:
    Variance = actual_progress - planned_progress (in percentage points)

    Categories:
    - "Completed": actual_progress >= 100.0 or status == "Done"
    - "Not started": actual_progress == 0.0 and planned_progress == 0.0
    - "Ahead of schedule": variance > tolerance
    - "On schedule": abs(variance) <= tolerance
    - "Behind schedule": variance < -tolerance
    """
    variance = round(actual_progress - planned_progress, 2)

    if actual_progress >= 100.0 or status.lower() == "done":
        return variance, "Completed"
    if actual_progress == 0.0 and planned_progress == 0.0:
        return variance, "Not started"
    if variance > tolerance:
        return variance, "Ahead of schedule"
    if abs(variance) <= tolerance:
        return variance, "On schedule"
    return variance, "Behind schedule"
