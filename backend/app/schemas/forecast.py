from datetime import date
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class TaskForecastItem(BaseModel):
    task_id: int
    task_name: str
    baseline_duration: float
    actual_progress: int
    remaining_duration: float
    forecast_early_start: float
    forecast_early_finish: float
    forecast_late_start: float
    forecast_late_finish: float
    slack: float
    is_critical: bool
    forecast_start_date: Optional[date] = None
    forecast_finish_date: Optional[date] = None

    model_config = ConfigDict(from_attributes=True)


class ProjectForecastResponse(BaseModel):
    project_id: int
    project_name: str
    as_of_date: date
    baseline_duration: float
    forecast_remaining_duration: float
    forecast_total_duration: float
    duration_variance: float
    project_start_date: Optional[date] = None
    forecast_completion_date: Optional[date] = None
    critical_path: List[int] = Field(default_factory=list)
    tasks: List[TaskForecastItem] = Field(default_factory=list)
    estimation_method: str = "Deterministic Earned Duration: Remaining = Baseline * (100 - Progress) / 100"

    model_config = ConfigDict(from_attributes=True)


class TaskDelayImpactResponse(BaseModel):
    task_id: int
    task_name: str
    project_id: int
    is_behind_schedule: bool
    delay_days: float
    available_slack: float
    slack_consumed: float
    project_completion_impact: float
    downstream_affected_task_ids: List[int] = Field(default_factory=list)
    critical_path_changed: bool
    original_critical_path: List[int] = Field(default_factory=list)
    simulated_critical_path: List[int] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)
