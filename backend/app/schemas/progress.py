from datetime import date
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class TaskProgressItem(BaseModel):
    task_id: int
    task_name: str
    status: str
    planned_progress: float = Field(..., description="Calculated planned progress % as of reference date")
    actual_progress: float = Field(..., description="Actual reported completion percentage (0-100)")
    variance: float = Field(..., description="Progress variance in percentage points (actual - planned)")
    status_label: str = Field(..., description="Ahead of schedule, On schedule, Behind schedule, Not started, or Completed")
    planned_start_date: Optional[date] = None
    planned_end_date: Optional[date] = None
    actual_start_date: Optional[date] = None
    actual_end_date: Optional[date] = None

    model_config = ConfigDict(from_attributes=True)


class ProjectProgressSummary(BaseModel):
    project_id: int
    project_name: str
    as_of_date: date
    total_tasks: int
    completed_tasks: int
    in_progress_tasks: int
    not_started_tasks: int
    overall_planned_progress: float = Field(..., description="Duration-weighted planned progress percentage")
    overall_actual_progress: float = Field(..., description="Duration-weighted actual progress percentage")
    overall_variance: float = Field(..., description="Overall variance in percentage points")
    project_health: str = Field(..., description="Overall health classification")
    tasks: List[TaskProgressItem] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)
