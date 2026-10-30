from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator, field_validator


class ProjectBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Project name")
    description: Optional[str] = Field(default=None, description="Detailed project description")
    status: Optional[str] = Field(default="Planned", max_length=50, description="Project status")
    start_date: Optional[date] = Field(default=None, description="Planned start date")
    deadline: Optional[date] = Field(default=None, description="Project deadline")
    team_size: Optional[int] = Field(default=1, ge=1, description="Number of assigned team members")

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Project name cannot be empty or whitespace only")
        return v.strip()

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            allowed = {"Planned", "Active", "Completed", "On Hold", "Cancelled"}
            if v not in allowed:
                raise ValueError(f"Invalid project status: '{v}'. Must be one of {sorted(allowed)}")
        return v


class ProjectCreate(ProjectBase):
    @model_validator(mode="after")
    def validate_dates(self) -> "ProjectCreate":
        if self.start_date and self.deadline and self.deadline < self.start_date:
            raise ValueError("Deadline cannot be earlier than the start date")
        return self


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    status: Optional[str] = Field(default=None, max_length=50)
    start_date: Optional[date] = None
    deadline: Optional[date] = None
    team_size: Optional[int] = Field(default=None, ge=1)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.strip():
            raise ValueError("Project name cannot be empty or whitespace only")
        return v.strip() if v is not None else None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            allowed = {"Planned", "Active", "Completed", "On Hold", "Cancelled"}
            if v not in allowed:
                raise ValueError(f"Invalid project status: '{v}'. Must be one of {sorted(allowed)}")
        return v

    @model_validator(mode="after")
    def validate_dates(self) -> "ProjectUpdate":
        if self.start_date and self.deadline and self.deadline < self.start_date:
            raise ValueError("Deadline cannot be earlier than the start date")
        return self


class ProjectResponse(ProjectBase):
    id: int
    created_at: datetime
    updated_at: datetime
    tasks_count: Optional[int] = 0

    model_config = ConfigDict(from_attributes=True)
