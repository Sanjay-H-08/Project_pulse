from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator


class DependencyCreate(BaseModel):
    task_id: int = Field(..., description="ID of the task that depends on another (successor)")
    depends_on_id: int = Field(..., description="ID of the task that must be done first (predecessor)")
    dependency_type: Optional[str] = Field(default="finish_to_start", max_length=50, description="Dependency type")
    lag_days: Optional[int] = Field(default=0, ge=0, description="Lag time in days between tasks")

    @model_validator(mode="after")
    def validate_not_self(self) -> "DependencyCreate":
        if self.task_id == self.depends_on_id:
            raise ValueError("A task cannot depend on itself")
        return self


class DependencyCreateForTask(BaseModel):
    depends_on_id: int = Field(..., description="ID of the task that must be done first (predecessor)")
    dependency_type: Optional[str] = Field(default="finish_to_start", max_length=50, description="Dependency type")
    lag_days: Optional[int] = Field(default=0, ge=0, description="Lag time in days between tasks")


class DependencyResponse(BaseModel):
    id: int
    project_id: int
    task_id: int
    depends_on_id: int
    dependency_type: str
    lag_days: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
