"""
Area D Audit: PERT Scheduling Mathematical and Policy Edge Cases.
"""
import pytest
from backend.app.algorithms.pert import calculate_pert_expected_duration, PertValidationError


def test_pert_math_equal_estimates():
    """When O == M == P, expected duration equals M and variance is exactly 0.0."""
    res = calculate_pert_expected_duration(optimistic=5.0, most_likely=5.0, pessimistic=5.0)
    assert res.expected_duration == 5.0
    assert res.variance == 0.0
    assert res.standard_deviation == 0.0


def test_pert_math_analytical_formulas():
    """
    Given O=2.0, M=5.0, P=14.0:
    Te  = (2 + 4*5 + 14) / 6 = 36 / 6 = 6.0
    Var = ((14 - 2) / 6)^2 = (12 / 6)^2 = 2^2 = 4.0
    SD  = (14 - 2) / 6 = 2.0
    """
    res = calculate_pert_expected_duration(optimistic=2.0, most_likely=5.0, pessimistic=14.0)
    assert res.expected_duration == 6.0
    assert res.variance == 4.0
    assert res.standard_deviation == 2.0


def test_pert_negative_values_rejected():
    """Negative values in PERT estimates raise PertValidationError."""
    with pytest.raises(PertValidationError):
        calculate_pert_expected_duration(optimistic=-1.0, most_likely=4.0, pessimistic=7.0)

    with pytest.raises(PertValidationError):
        calculate_pert_expected_duration(optimistic=2.0, most_likely=-3.0, pessimistic=7.0)

    with pytest.raises(PertValidationError):
        calculate_pert_expected_duration(optimistic=2.0, most_likely=4.0, pessimistic=-1.0)


def test_pert_invalid_ordering_rejected():
    """O > M or M > P raises PertValidationError."""
    # O > M
    with pytest.raises(PertValidationError):
        calculate_pert_expected_duration(optimistic=6.0, most_likely=5.0, pessimistic=8.0)

    # M > P
    with pytest.raises(PertValidationError):
        calculate_pert_expected_duration(optimistic=3.0, most_likely=9.0, pessimistic=8.0)


def test_pert_immutability_of_task_durations(client):
    """
    Computing and saving a PERT schedule MUST NOT overwrite the task's
    original baseline duration in the tasks table.
    """
    p = client.post("/api/projects", json={"name": "PERT Immutability Verification"}).json()["id"]

    t = client.post("/api/tasks", json={
        "project_id": p,
        "name": "Heavy Foundry Pouring",
        "duration": 20,  # Baseline duration
        "optimistic_duration": 10.0,
        "most_likely_duration": 14.0,
        "pessimistic_duration": 24.0  # Te = (10 + 56 + 24)/6 = 90/6 = 15.0
    }).json()

    # Calculate PERT schedule
    pert_resp = client.post(f"/api/projects/{p}/schedule", json={"use_pert": True})
    assert pert_resp.status_code == 200
    assert pert_resp.json()["total_duration"] == 15.0

    # Retrieve task directly from DB: duration MUST still be 20
    db_task = client.get(f"/api/tasks/{t['id']}").json()
    assert db_task["duration"] == 20


def test_pert_and_baseline_schedules_remain_distinct(client):
    """
    GET /api/projects/{id}/schedule?use_pert=false and ?use_pert=true
    must return their distinct schedule records without interfering.
    """
    p = client.post("/api/projects", json={"name": "Distinct Schedules Plant"}).json()["id"]

    client.post("/api/tasks", json={
        "project_id": p,
        "name": "Machining Operation",
        "duration": 25,
        "optimistic_duration": 12.0,
        "most_likely_duration": 15.0,
        "pessimistic_duration": 24.0  # Te = (12 + 60 + 24)/6 = 96/6 = 16.0
    })

    # Request baseline schedule
    base = client.get(f"/api/projects/{p}/schedule?use_pert=false").json()
    assert base["use_pert"] is False
    assert base["total_duration"] == 25.0

    # Request PERT schedule
    pert = client.get(f"/api/projects/{p}/schedule?use_pert=true").json()
    assert pert["use_pert"] is True
    assert pert["total_duration"] == 16.0

    # Re-request baseline to ensure no mutation occurred
    base_re = client.get(f"/api/projects/{p}/schedule?use_pert=false").json()
    assert base_re["total_duration"] == 25.0
