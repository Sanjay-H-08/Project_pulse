from datetime import datetime
from typing import List, Optional, Dict
from pydantic import BaseModel, ConfigDict, Field
from backend.app.schemas.pert import PertInput, PertEstimate


class ScheduleRequest(BaseModel):
    use_pert: bool = Field(default=False, description="Calculate schedule using PERT expected durations")
    task_pert_estimates: Optional[Dict[int, PertInput]] = Field(
        default=None,
        description="Optional overrides for PERT three-point estimates keyed by task ID"
    )


class TaskScheduleItem(BaseModel):
    task_id: int = Field(..., description="Unique task identifier")
    task_name: str = Field(..., description="Task name")
    duration: float = Field(..., description="Effective duration used for scheduling (days)")
    early_start: float = Field(..., description="Earliest Start (ES) day")
    early_finish: float = Field(..., description="Earliest Finish (EF) day")
    late_start: float = Field(..., description="Latest Start (LS) day")
    late_finish: float = Field(..., description="Latest Finish (LF) day")
    slack: float = Field(..., description="Total Float / Slack (LS - ES)")
    is_critical: bool = Field(..., description="True if task lies on a critical path (slack == 0)")
    predecessors: List[int] = Field(default_factory=list, description="IDs of prerequisite tasks")
    successors: List[int] = Field(default_factory=list, description="IDs of dependent tasks")
    pert_estimate: Optional[PertEstimate] = Field(default=None, description="PERT calculation details if applicable")

    model_config = ConfigDict(from_attributes=True)


class ProjectScheduleResponse(BaseModel):
    project_id: int = Field(..., description="Project identifier")
    project_name: str = Field(..., description="Project name")
    total_duration: float = Field(..., description="Minimum project completion duration (days)")
    critical_path: List[int] = Field(default_factory=list, description="Primary critical path task IDs in sequence")
    critical_paths: List[List[int]] = Field(default_factory=list, description="All critical paths in sequence")
    critical_path_task_ids: List[int] = Field(default_factory=list, description="All unique critical task IDs")
    tasks: List[TaskScheduleItem] = Field(default_factory=list, description="Scheduled tasks with CPM metrics")
    use_pert: bool = Field(default=False, description="Whether PERT was used for this schedule")
    calculated_at: datetime = Field(..., description="Timestamp when schedule was calculated")

    model_config = ConfigDict(from_attributes=True)
