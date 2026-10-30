"""
Area E Audit: Progress Monitoring and Planned vs Actual Calculation Edge Cases.
"""
from datetime import date
from backend.app.algorithms.progress import calculate_task_planned_progress, classify_task_progress


def test_planned_progress_date_boundaries_pure():
    """
    Tests exact date boundary conditions for calculate_task_planned_progress:
    Planned window: 2026-06-01 to 2026-06-11 (10 days duration).
    """
    start_d = date(2026, 6, 1)
    end_d = date(2026, 6, 11)
    dur = 10.0

    # 1. Before task start
    assert calculate_task_planned_progress(start_d, end_d, date(2026, 5, 31), dur) == 0.0

    # 2. On task start date
    assert calculate_task_planned_progress(start_d, end_d, date(2026, 6, 1), dur) == 0.0

    # 3. 1 day in (10%)
    assert calculate_task_planned_progress(start_d, end_d, date(2026, 6, 2), dur) == 10.0

    # 4. Midway (5 days in, 50%)
    assert calculate_task_planned_progress(start_d, end_d, date(2026, 6, 6), dur) == 50.0

    # 5. 9 days in (90%)
    assert calculate_task_planned_progress(start_d, end_d, date(2026, 6, 10), dur) == 90.0

    # 6. On task end date (100%)
    assert calculate_task_planned_progress(start_d, end_d, date(2026, 6, 11), dur) == 100.0

    # 7. After task end date (100%)
    assert calculate_task_planned_progress(start_d, end_d, date(2026, 6, 15), dur) == 100.0


def test_progress_classification_categories_pure():
    """
    Verifies classification: Completed, Ahead, On schedule, Behind, Not started.
    """
    # 1. Completed
    var, label = classify_task_progress(actual_progress=100.0, planned_progress=80.0, status="Done")
    assert label == "Completed"

    # 2. Not started
    var, label = classify_task_progress(actual_progress=0.0, planned_progress=0.0, status="To Do")
    assert label == "Not started"
    assert var == 0.0

    # 3. Ahead of schedule (actual 60%, planned 40% -> variance +20%)
    var, label = classify_task_progress(actual_progress=60.0, planned_progress=40.0, status="In Progress")
    assert label == "Ahead of schedule"
    assert var == 20.0

    # 4. On schedule (actual 50.0%, planned 50.0% -> variance 0%)
    var, label = classify_task_progress(actual_progress=50.0, planned_progress=50.0, status="In Progress")
    assert label == "On schedule"
    assert var == 0.0

    # 5. Behind schedule (actual 20.0%, planned 50.0% -> variance -30%)
    var, label = classify_task_progress(actual_progress=20.0, planned_progress=50.0, status="In Progress")
    assert label == "Behind schedule"
    assert var == -30.0


def test_repeated_progress_transitions_and_actual_dates(client):
    """
    Tests repeated state transitions on a single task:
    0% -> 1% -> 50% -> 99% -> 100% -> 60% -> 100% -> 0%
    Verifying actual_start_date, actual_end_date, and status consistency at every step.
    """
    p = client.post("/api/projects", json={"name": "State Machine Plant"}).json()["id"]
    t = client.post("/api/tasks", json={
        "project_id": p,
        "name": "Valve Calibration",
        "duration": 5,
        "progress": 0
    }).json()

    # Step 1: 0% -> To Do, no dates
    assert t["status"] == "To Do"
    assert t["actual_start_date"] is None
    assert t["actual_end_date"] is None

    # Step 2: 1% -> In Progress, actual_start_date set
    u1 = client.put(f"/api/tasks/{t['id']}", json={"progress": 1}).json()
    assert u1["status"] == "In Progress"
    assert u1["actual_start_date"] is not None
    assert u1["actual_end_date"] is None
    first_start = u1["actual_start_date"]

    # Step 3: 50% -> In Progress, same start date
    u2 = client.put(f"/api/tasks/{t['id']}", json={"progress": 50}).json()
    assert u2["status"] == "In Progress"
    assert u2["actual_start_date"] == first_start
    assert u2["actual_end_date"] is None

    # Step 4: 99% -> In Progress, same start date
    u3 = client.put(f"/api/tasks/{t['id']}", json={"progress": 99}).json()
    assert u3["status"] == "In Progress"
    assert u3["actual_start_date"] == first_start
    assert u3["actual_end_date"] is None

    # Step 5: 100% -> Done, actual_end_date set
    u4 = client.put(f"/api/tasks/{t['id']}", json={"progress": 100}).json()
    assert u4["status"] == "Done"
    assert u4["actual_start_date"] == first_start
    assert u4["actual_end_date"] is not None

    # Step 6: Reopen to 60% -> In Progress, actual_end_date cleared!
    u5 = client.put(f"/api/tasks/{t['id']}", json={"progress": 60}).json()
    assert u5["status"] == "In Progress"
    assert u5["actual_start_date"] == first_start
    assert u5["actual_end_date"] is None

    # Step 7: Complete again to 100% -> Done, actual_end_date re-recorded
    u6 = client.put(f"/api/tasks/{t['id']}", json={"progress": 100}).json()
    assert u6["status"] == "Done"
    assert u6["actual_end_date"] is not None

    # Step 8: Reset to 0% -> To Do, both actual dates cleared
    u7 = client.put(f"/api/tasks/{t['id']}", json={"progress": 0}).json()
    assert u7["status"] == "To Do"
    assert u7["actual_start_date"] is None
    assert u7["actual_end_date"] is None
