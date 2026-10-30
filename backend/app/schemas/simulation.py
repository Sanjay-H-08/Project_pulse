from typing import List
from pydantic import BaseModel, ConfigDict, Field


class TaskDelayInput(BaseModel):
    task_id: int = Field(..., description="Task ID to simulate additional delay on")
    delay_days: float = Field(..., ge=0, description="Hypothetical additional delay in working days (>= 0)")


class WhatIfSimulationRequest(BaseModel):
    delays: List[TaskDelayInput] = Field(default_factory=list, description="List of task delay scenarios to simulate")
    use_pert: bool = Field(default=False, description="Whether to simulate against PERT schedule baseline")


class SimulatedTaskImpact(BaseModel):
    task_id: int
    task_name: str
    original_duration: float
    simulated_duration: float
    original_early_start: float
    original_early_finish: float
    simulated_early_start: float
    simulated_early_finish: float
    start_delay: float
    finish_delay: float
    slack_consumed: float
    new_slack: float
    is_critical: bool

    model_config = ConfigDict(from_attributes=True)


class WhatIfSimulationResponse(BaseModel):
    project_id: int
    baseline_duration: float
    simulated_duration: float
    project_delay: float
    critical_path_changed: bool
    original_critical_path: List[int] = Field(default_factory=list)
    simulated_critical_path: List[int] = Field(default_factory=list)
    simulated_critical_task_ids: List[int] = Field(default_factory=list)
    affected_task_ids: List[int] = Field(default_factory=list)
    task_impacts: List[SimulatedTaskImpact] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)
