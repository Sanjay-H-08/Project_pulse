from pydantic import BaseModel, ConfigDict, Field, model_validator


class PertInput(BaseModel):
    optimistic: float = Field(..., ge=0, description="Optimistic duration (O)")
    most_likely: float = Field(..., ge=0, description="Most likely duration (M)")
    pessimistic: float = Field(..., ge=0, description="Pessimistic duration (P)")

    @model_validator(mode="after")
    def validate_pert_order(self) -> "PertInput":
        if self.optimistic > self.most_likely:
            raise ValueError(
                f"Optimistic duration ({self.optimistic}) cannot exceed most likely duration ({self.most_likely})"
            )
        if self.most_likely > self.pessimistic:
            raise ValueError(
                f"Most likely duration ({self.most_likely}) cannot exceed pessimistic duration ({self.pessimistic})"
            )
        return self


class PertEstimate(BaseModel):
    optimistic: float
    most_likely: float
    pessimistic: float
    expected_duration: float
    variance: float
    standard_deviation: float

    model_config = ConfigDict(from_attributes=True)
