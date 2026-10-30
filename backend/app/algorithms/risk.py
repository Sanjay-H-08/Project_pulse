from typing import Tuple, Dict, Any


class RiskValidationError(ValueError):
    """Raised when likelihood or impact values fail validation."""
    pass


def classify_risk_score(score: int) -> str:
    """
    Classifies a risk score into its designated category:
    - 1 to 4: Low
    - 5 to 9: Medium
    - 10 to 16: High
    - 17 to 25: Critical
    """
    if 1 <= score <= 4:
        return "Low"
    elif 5 <= score <= 9:
        return "Medium"
    elif 10 <= score <= 16:
        return "High"
    elif 17 <= score <= 25:
        return "Critical"
    else:
        raise RiskValidationError(f"Invalid risk score: {score}. Score must be between 1 and 25.")


def calculate_risk(likelihood: int, impact: int) -> Tuple[int, str]:
    """
    Calculates deterministic risk score and category:
    Score = Likelihood * Impact
    Both likelihood and impact must be integers from 1 to 5.
    """
    if not isinstance(likelihood, int) or not (1 <= likelihood <= 5):
        raise RiskValidationError(f"Likelihood must be an integer between 1 and 5. Received: {likelihood}")
    if not isinstance(impact, int) or not (1 <= impact <= 5):
        raise RiskValidationError(f"Impact must be an integer between 1 and 5. Received: {impact}")

    score = likelihood * impact
    category = classify_risk_score(score)
    return score, category
