import math
from typing import NamedTuple


class PertCalculationResult(NamedTuple):
    expected_duration: float
    variance: float
    standard_deviation: float


class PertValidationError(ValueError):
    """Raised when PERT three-point estimates fail mathematical validation."""
    pass


def validate_pert_estimates(
    optimistic: float,
    most_likely: float,
    pessimistic: float
) -> None:
    """
    Validates three-point estimates for PERT:
    1. All values must be non-negative.
    2. Must satisfy: Optimistic <= Most Likely <= Pessimistic.
    """
    if optimistic < 0 or most_likely < 0 or pessimistic < 0:
        raise PertValidationError(
            f"PERT estimates must be non-negative. Given: "
            f"Optimistic={optimistic}, Most Likely={most_likely}, Pessimistic={pessimistic}"
        )

    if optimistic > most_likely:
        raise PertValidationError(
            f"Optimistic duration ({optimistic}) cannot exceed most likely duration ({most_likely})."
        )

    if most_likely > pessimistic:
        raise PertValidationError(
            f"Most likely duration ({most_likely}) cannot exceed pessimistic duration ({pessimistic})."
        )


def calculate_pert_expected_duration(
    optimistic: float,
    most_likely: float,
    pessimistic: float,
    round_decimals: int = 4
) -> PertCalculationResult:
    """
    Calculates PERT Expected Duration, Variance, and Standard Deviation.

    Formulas:
    Expected Duration (Te) = (O + 4M + P) / 6
    Variance (Var)         = ((P - O) / 6) ^ 2
    Standard Deviation (s) = (P - O) / 6
    """
    validate_pert_estimates(optimistic, most_likely, pessimistic)

    expected = (optimistic + 4.0 * most_likely + pessimistic) / 6.0
    sd = (pessimistic - optimistic) / 6.0
    variance = sd ** 2

    return PertCalculationResult(
        expected_duration=round(expected, round_decimals),
        variance=round(variance, round_decimals),
        standard_deviation=round(sd, round_decimals)
    )
