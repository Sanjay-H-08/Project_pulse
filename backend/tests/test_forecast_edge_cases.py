"""
Area F Audit: Project Forecasting and Remaining Work Edge Cases.
"""
from backend.app.algorithms.forecast import estimate_remaining_duration


def test_estimate_remaining_duration_formula():
    """
    Tests exact remaining duration math:
    - 0% progress -> 100% remaining duration
    - 25% progress on duration 10 -> 7.5 remaining
    - 50% progress on duration 10 -> 5.0 remaining
    - 100% progress on duration 10 -> 0.0 remaining
    """
    assert estimate_remaining_duration(10.0, 0) == 10.0
    assert estimate_remaining_duration(10.0, 25) == 7.5
    assert estimate_remaining_duration(10.0, 50) == 5.0
    assert estimate_remaining_duration(10.0, 75) == 2.5
    assert estimate_remaining_duration(10.0, 100) == 0.0


def test_forecast_all_tasks_unstarted(client):
    """When all tasks are at 0% progress, forecast remaining duration equals baseline duration."""
    p = client.post("/api/projects", json={"name": "Fresh Project", "start_date": "2026-07-01"}).json()["id"]
    t1 = client.post("/api/tasks", json={"project_id": p, "name": "T1", "duration": 8}).json()["id"]
    t2 = client.post("/api/tasks", json={"project_id": p, "name": "T2", "duration": 12}).json()["id"]
    client.post("/api/dependencies", json={"task_id": t2, "depends_on_id": t1})

    #fc = client.get(f"/api/projects/{p}/forecast").json()
    fc = client.get(
    f"/api/projects/{p}/forecast?as_of_date=2026-07-01").json()
    assert fc["baseline_duration"] == 20.0
    assert fc["forecast_remaining_duration"] == 20.0
    assert fc["duration_variance"] == 0.0


def test_forecast_mixture_of_progress_values(client):
    """
    Chain: T1 (dur 10, prog 100% -> rem 0) -> T2 (dur 10, prog 40% -> rem 6) -> T3 (dur 10, prog 0% -> rem 10).
    Baseline = 30.
    Remaining CPM = 0 + 6 + 10 = 16.
    """
    p = client.post("/api/projects", json={"name": "Progress Mixture Plant", "start_date": "2026-08-01"}).json()["id"]
    t1 = client.post("/api/tasks", json={"project_id": p, "name": "T1", "duration": 10, "progress": 100}).json()["id"]
    t2 = client.post("/api/tasks", json={"project_id": p, "name": "T2", "duration": 10, "progress": 40}).json()["id"]
    t3 = client.post("/api/tasks", json={"project_id": p, "name": "T3", "duration": 10, "progress": 0}).json()["id"]

    client.post("/api/dependencies", json={"task_id": t2, "depends_on_id": t1})
    client.post("/api/dependencies", json={"task_id": t3, "depends_on_id": t2})

    fc = client.get(f"/api/projects/{p}/forecast?as_of_date=2026-08-15").json()
    assert fc["baseline_duration"] == 30.0
    assert fc["forecast_remaining_duration"] == 16.0

    # Ensure baseline schedule is still 30
    sched = client.get(f"/api/projects/{p}/schedule").json()
    assert sched["total_duration"] == 30.0


def test_forecast_without_project_start_date(client):
    """
    Projects without start_date return forecast duration metrics gracefully,
    with forecast_completion_date set to None.
    """
    p = client.post("/api/projects", json={"name": "Unanchored Forecast Plant"}).json()["id"]
    client.post("/api/tasks", json={"project_id": p, "name": "T1", "duration": 15, "progress": 20})

    fc = client.get(f"/api/projects/{p}/forecast").json()
    assert fc["baseline_duration"] == 15.0
    assert fc["forecast_remaining_duration"] == 12.0  # 15 * 0.8 = 12.0
    assert fc["forecast_completion_date"] is None
