from datetime import date, datetime
from typing import Optional, List, Any
from pydantic import BaseModel, ConfigDict, Field, model_validator, field_validator


class TaskBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Task name")
    description: Optional[str] = Field(default=None, description="Task description")
    duration: int = Field(default=1, ge=1, description="Estimated duration in days")

    # PERT duration estimates
    optimistic_duration: Optional[float] = Field(default=None, ge=0, description="Optimistic duration (O)")
    most_likely_duration: Optional[float] = Field(default=None, ge=0, description="Most likely duration (M)")
    pessimistic_duration: Optional[float] = Field(default=None, ge=0, description="Pessimistic duration (P)")

    # Planned dates
    start_date: Optional[date] = Field(default=None, description="Task planned start date")
    end_date: Optional[date] = Field(default=None, description="Task planned deadline/end date")

    # Actual progress dates
    actual_start_date: Optional[date] = Field(default=None, description="Actual start date when work began")
    actual_end_date: Optional[date] = Field(default=None, description="Actual completion date")

    status: str = Field(default="To Do", max_length=50, description="Task status (To Do, In Progress, Done, Blocked)")
    priority: str = Field(default="Medium", max_length=50, description="Priority level (Low, Medium, High, Critical)")
    progress: int = Field(default=0, ge=0, le=100, description="Completion percentage (0 to 100)")
    assignee: Optional[str] = Field(default=None, max_length=255, description="Assigned engineer or team member")

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Task name cannot be empty or whitespace only")
        return v.strip()

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            allowed = {"To Do", "In Progress", "Done", "Blocked"}
            if v not in allowed:
                raise ValueError(f"Invalid task status: '{v}'. Must be one of {sorted(allowed)}")
        return v

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            allowed = {"Low", "Medium", "High", "Critical"}
            if v not in allowed:
                raise ValueError(f"Invalid task priority: '{v}'. Must be one of {sorted(allowed)}")
        return v

    @model_validator(mode="after")
    def validate_pert_triplet(self) -> "TaskBase":
        o = self.optimistic_duration
        m = self.most_likely_duration
        p = self.pessimistic_duration
        if o is not None and m is not None and o > m:
            raise ValueError(f"Optimistic duration ({o}) cannot exceed most likely duration ({m})")
        if m is not None and p is not None and m > p:
            raise ValueError(f"Most likely duration ({m}) cannot exceed pessimistic duration ({p})")
        if o is not None and p is not None and o > p:
            raise ValueError(f"Optimistic duration ({o}) cannot exceed pessimistic duration ({p})")
        return self

    @model_validator(mode="after")
    def validate_status_and_progress_consistency(self) -> "TaskBase":
        # Progress and status consistency / auto-alignment
        if "status" in self.model_fields_set and "progress" not in self.model_fields_set:
            if self.status == "Done":
                self.progress = 100
            elif self.status == "To Do":
                self.progress = 0
        elif "progress" in self.model_fields_set and "status" not in self.model_fields_set:
            if self.progress == 100:
                self.status = "Done"
            elif self.progress > 0:
                self.status = "In Progress"
            else:
                self.status = "To Do"
        else:
            if self.status == "Done" and self.progress < 100:
                raise ValueError("Task with status 'Done' must have 100% progress")
            if self.status == "To Do" and self.progress == 100:
                raise ValueError("Task with status 'To Do' cannot have 100% progress")

        # Actual dates consistency
        if self.actual_start_date and self.actual_end_date and self.actual_end_date < self.actual_start_date:
            raise ValueError("Actual completion date cannot be earlier than actual start date")
        return self


class TaskCreate(TaskBase):
    project_id: int = Field(..., description="Project ID that this task belongs to")
    depends_on_ids: Optional[List[int]] = Field(default=None, description="Optional prerequisite task IDs")

    @model_validator(mode="after")
    def validate_dates(self) -> "TaskCreate":
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("Task end date cannot be earlier than start date")
        return self


class TaskUpdate(BaseModel):
    project_id: Optional[int] = None
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    duration: Optional[int] = Field(default=None, ge=1)
    optimistic_duration: Optional[float] = Field(default=None, ge=0)
    most_likely_duration: Optional[float] = Field(default=None, ge=0)
    pessimistic_duration: Optional[float] = Field(default=None, ge=0)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    actual_start_date: Optional[date] = None
    actual_end_date: Optional[date] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    progress: Optional[int] = Field(default=None, ge=0, le=100)
    assignee: Optional[str] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.strip():
            raise ValueError("Task name cannot be empty or whitespace only")
        return v.strip() if v is not None else None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            allowed = {"To Do", "In Progress", "Done", "Blocked"}
            if v not in allowed:
                raise ValueError(f"Invalid task status: '{v}'. Must be one of {sorted(allowed)}")
        return v

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            allowed = {"Low", "Medium", "High", "Critical"}
            if v not in allowed:
                raise ValueError(f"Invalid task priority: '{v}'. Must be one of {sorted(allowed)}")
        return v

    @model_validator(mode="after")
    def validate_dates(self) -> "TaskUpdate":
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("Task end date cannot be earlier than start date")
        if self.actual_start_date and self.actual_end_date and self.actual_end_date < self.actual_start_date:
            raise ValueError("Actual completion date cannot be earlier than actual start date")

        o = self.optimistic_duration
        m = self.most_likely_duration
        p = self.pessimistic_duration
        if o is not None and m is not None and o > m:
            raise ValueError(f"Optimistic duration ({o}) cannot exceed most likely duration ({m})")
        if m is not None and p is not None and m > p:
            raise ValueError(f"Most likely duration ({m}) cannot exceed pessimistic duration ({p})")
        if o is not None and p is not None and o > p:
            raise ValueError(f"Optimistic duration ({o}) cannot exceed pessimistic duration ({p})")

        # Status and progress consistency if both provided
        if self.status == "Done" and self.progress is not None and self.progress < 100:
            raise ValueError("Task with status 'Done' must have 100% progress")
        if self.status == "To Do" and self.progress == 100:
            raise ValueError("Task with status 'To Do' cannot have 100% progress")
        return self


class TaskResponse(TaskBase):
    id: int
    project_id: int
    created_at: datetime
    updated_at: datetime
    dependencies: List[int] = Field(default_factory=list, description="IDs of tasks this task depends on")

    @field_validator("dependencies", mode="before")
    @classmethod
    def extract_dependency_ids(cls, v: Any) -> List[int]:
        if isinstance(v, list):
            result = []
            for item in v:
                if hasattr(item, "depends_on_id"):
                    result.append(item.depends_on_id)
                elif isinstance(item, int):
                    result.append(item)
            return result
        return []

    model_config = ConfigDict(from_attributes=True)
