from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field, model_validator, field_validator
from backend.app.algorithms.risk import calculate_risk


class RiskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255, description="Risk title or summary")
    description: Optional[str] = Field(default=None, description="Detailed explanation of risk condition")
    task_id: Optional[int] = Field(default=None, description="Optional associated task ID")
    likelihood: int = Field(..., ge=1, le=5, description="Likelihood rating (1: Rare, 5: Almost Certain)")
    impact: int = Field(..., ge=1, le=5, description="Impact severity rating (1: Negligible, 5: Catastrophic)")
    mitigation: Optional[str] = Field(default=None, description="Planned risk mitigation or contingency action")

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Risk title cannot be empty or whitespace only")
        return v.strip()


class RiskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    task_id: Optional[int] = None
    likelihood: Optional[int] = Field(default=None, ge=1, le=5)
    impact: Optional[int] = Field(default=None, ge=1, le=5)
    mitigation: Optional[str] = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.strip():
            raise ValueError("Risk title cannot be empty or whitespace only")
        return v.strip() if v is not None else None


class RiskResponse(BaseModel):
    id: int
    project_id: int
    task_id: Optional[int]
    title: str
    description: Optional[str]
    likelihood: int
    impact: int
    score: int
    category: str
    mitigation: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProjectRiskSummary(BaseModel):
    project_id: int
    total_risks: int
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int
    average_score: float
    max_score: int
    risks: List[RiskResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)
