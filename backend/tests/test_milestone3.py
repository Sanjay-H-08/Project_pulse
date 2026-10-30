import pytest
from datetime import date, timedelta


# ---------------------------------------------------------------------------
# 1. Progress Tracking, Actual Dates, and Status Validation Tests
# ---------------------------------------------------------------------------

def test_task_progress_auto_dates_and_status(client):
    """
    Verifies that task progress updates trigger automatic status alignment
    and date tracking (actual_start_date on >0%, actual_end_date on 100%).
    """
    p_resp = client.post("/api/projects", json={
        "name": "Assembly Line Installation",
        "start_date": "2026-05-01"
    })
    project_id = p_resp.json()["id"]

    # 1. Create task with 0% progress -> To Do
    t_resp = client.post("/api/tasks", json={
        "project_id": project_id,
        "name": "Mount Robotic Arm",
        "duration": 5,
        "progress": 0
    })
    assert t_resp.status_code == 201
    task = t_resp.json()
    task_id = task["id"]
    assert task["status"] == "To Do"
    assert task["actual_start_date"] is None
    assert task["actual_end_date"] is None

    # 2. Update progress to 40% -> Status becomes "In Progress", actual_start_date recorded
    u1_resp = client.put(f"/api/tasks/{task_id}", json={
        "progress": 40
    })
    assert u1_resp.status_code == 200
    task_u1 = u1_resp.json()
    assert task_u1["status"] == "In Progress"
    assert task_u1["progress"] == 40
    assert task_u1["actual_start_date"] is not None
    assert task_u1["actual_end_date"] is None
    start_date = task_u1["actual_start_date"]

    # 3. Update progress to 100% -> Status becomes "Done", actual_end_date recorded
    u2_resp = client.put(f"/api/tasks/{task_id}", json={
        "progress": 100
    })
    assert u2_resp.status_code == 200
    task_u2 = u2_resp.json()
    assert task_u2["status"] == "Done"
    assert task_u2["progress"] == 100
    assert task_u2["actual_start_date"] == start_date
    assert task_u2["actual_end_date"] is not None


def test_task_status_progress_inconsistency_rejected(client):
    """
    Verifies that conflicting status and progress values are rejected with 422.
    """
    p_resp = client.post("/api/projects", json={"name": "Safety Validation Plant"})
    project_id = p_resp.json()["id"]

    # Status Done but progress 50%
    r1 = client.post("/api/tasks", json={
        "project_id": project_id,
        "name": "Safety Interlock Check",
        "duration": 3,
        "status": "Done",
        "progress": 50
    })
    assert r1.status_code == 422

    # Status To Do but progress 100%
    r2 = client.post("/api/tasks", json={
        "project_id": project_id,
        "name": "PLC Firmware Flash",
        "duration": 2,
        "status": "To Do",
        "progress": 100
    })
    assert r2.status_code == 422

    # Actual end date earlier than actual start date
    r3 = client.post("/api/tasks", json={
        "project_id": project_id,
        "name": "Conveyor Alignment",
        "duration": 4,
        "actual_start_date": "2026-06-10",
        "actual_end_date": "2026-06-05"
    })
    assert r3.status_code == 422


# ---------------------------------------------------------------------------
# 2. Planned vs Actual Progress Calculation Tests
# ---------------------------------------------------------------------------

def test_project_progress_calculation(client):
    """
    Verifies planned progress calculation against calendar schedule,
    variance calculation, task classifications, and duration-weighted project totals.
    """
    # Project begins on 2026-01-01
    p_resp = client.post("/api/projects", json={
        "name": "Turbine Overhaul 2026",
        "start_date": "2026-01-01"
    })
    project_id = p_resp.json()["id"]

    # Task 1: Day 0 to 10 (Duration 10)
    t1_resp = client.post("/api/tasks", json={
        "project_id": project_id,
        "name": "Disassemble Rotor",
        "duration": 10
    })
    t1_id = t1_resp.json()["id"]

    # Task 2: Day 10 to 20 (Duration 10) depends on Task 1
    t2_resp = client.post("/api/tasks", json={
        "project_id": project_id,
        "name": "Rotor Blade Inspection",
        "duration": 10
    })
    t2_id = t2_resp.json()["id"]

    client.post("/api/dependencies", json={
        "project_id": project_id,
        "task_id": t2_id,
        "depends_on_id": t1_id
    })

    # Set Task 1 actual progress to 80% (In Progress)
    client.put(f"/api/tasks/{t1_id}", json={"progress": 80})

    # Query progress as of 2026-01-06 (Day 5, midway through Task 1)
    # Task 1 planned: 5/10 = 50%, actual: 80% -> Variance = +30% -> Ahead of schedule
    # Task 2 planned: 0% (starts day 10), actual: 0% -> Variance = 0% -> Not started
    prog_resp = client.get(f"/api/projects/{project_id}/progress?as_of_date=2026-01-06")
    assert prog_resp.status_code == 200
    prog = prog_resp.json()

    assert prog["project_id"] == project_id
    assert prog["total_tasks"] == 2
    assert prog["completed_tasks"] == 0
    assert prog["in_progress_tasks"] == 1
    assert prog["not_started_tasks"] == 1

    t1_item = next(t for t in prog["tasks"] if t["task_id"] == t1_id)
    assert t1_item["planned_progress"] == 50.0
    assert t1_item["actual_progress"] == 80.0
    assert t1_item["variance"] == 30.0
    assert t1_item["status_label"] == "Ahead of schedule"

    t2_item = next(t for t in prog["tasks"] if t["task_id"] == t2_id)
    assert t2_item["planned_progress"] == 0.0
    assert t2_item["actual_progress"] == 0.0
    assert t2_item["variance"] == 0.0
    assert t2_item["status_label"] == "Not started"

    # Overall: Task 1 weight 10, Task 2 weight 10.
    # Planned = (10*50 + 10*0)/20 = 25.0%
    # Actual = (10*80 + 10*0)/20 = 40.0%
    assert prog["overall_planned_progress"] == 25.0
    assert prog["overall_actual_progress"] == 40.0
    assert prog["overall_variance"] == 15.0
    assert prog["project_health"] == "Ahead of schedule"

    # Test progress analysis endpoint returns same data
    analysis_resp = client.get(f"/api/projects/{project_id}/progress/analysis?as_of_date=2026-01-06")
    assert analysis_resp.status_code == 200
    assert analysis_resp.json()["overall_variance"] == 15.0


def test_progress_without_project_start_date_returns_400(client):
    """
    Verifies that requesting calendar-based progress on a project without start_date returns 400.
    """
    p_resp = client.post("/api/projects", json={"name": "Floating Schedule Project"})
    project_id = p_resp.json()["id"]

    client.post("/api/tasks", json={
        "project_id": project_id,
        "name": "Unanchored Task",
        "duration": 5
    })

    resp = client.get(f"/api/projects/{project_id}/progress")
    assert resp.status_code == 400
    assert "start date is not configured" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# 3. Forecasting Tests (Earned Duration & Remaining Work)
# ---------------------------------------------------------------------------

def test_project_forecast_remaining_duration_and_cpm(client):
    """
    Verifies earned duration forecasting:
    Remaining Duration = Baseline Duration * (100 - Progress) / 100.
    Ensures baseline schedule is not mutated.
    """
    p_resp = client.post("/api/projects", json={
        "name": "Chemical Plant Expansion",
        "start_date": "2026-03-01"
    })
    project_id = p_resp.json()["id"]

    t1 = client.post("/api/tasks", json={
        "project_id": project_id,
        "name": "Piping Foundation",
        "duration": 10,
        "progress": 100  # 100% -> remaining = 0
    }).json()

    t2 = client.post("/api/tasks", json={
        "project_id": project_id,
        "name": "Pipe Fitting",
        "duration": 20,
        "progress": 50   # 50% -> remaining = 10
    }).json()

    client.post("/api/dependencies", json={
        "project_id": project_id,
        "task_id": t2["id"],
        "depends_on_id": t1["id"]
    })

    # Baseline schedule duration = 10 + 20 = 30
    fc_resp = client.get(f"/api/projects/{project_id}/forecast?as_of_date=2026-03-15")
    assert fc_resp.status_code == 200
    fc = fc_resp.json()

    assert fc["baseline_duration"] == 30.0
    assert fc["forecast_remaining_duration"] == 10.0

    # Task 1 remaining duration = 0, Task 2 remaining duration = 10
    t1_fc = next(t for t in fc["tasks"] if t["task_id"] == t1["id"])
    t2_fc = next(t for t in fc["tasks"] if t["task_id"] == t2["id"])
    assert t1_fc["remaining_duration"] == 0.0
    assert t2_fc["remaining_duration"] == 10.0

    # Verify baseline in DB remains unmodified
    base_sched_resp = client.get(f"/api/projects/{project_id}/schedule")
    assert base_sched_resp.status_code == 200
    assert base_sched_resp.json()["total_duration"] == 30.0


# ---------------------------------------------------------------------------
# 4. Delay Impact Analysis Tests
# ---------------------------------------------------------------------------

def test_task_delay_impact_on_critical_and_non_critical_tasks(client):
    """
    Verifies delay impact analysis:
    - Critical task delay consumes 0 float and impacts project completion 1-to-1.
    - Non-critical task delay consumes available float first before delaying project.
    - Downstream affected tasks are correctly traced.
    """
    p_resp = client.post("/api/projects", json={"name": "Factory Automation Line"})
    project_id = p_resp.json()["id"]

    # Graph structure:
    # A (5d) -> B (10d) -> D (5d)  [Path: 20d, critical, slack = 0]
    # A (5d) -> C (4d)  -> D (5d)  [Path: 14d, non-critical, C slack = 6d]
    tA = client.post("/api/tasks", json={"project_id": project_id, "name": "Task A", "duration": 5}).json()
    tB = client.post("/api/tasks", json={"project_id": project_id, "name": "Task B", "duration": 10}).json()
    tC = client.post("/api/tasks", json={"project_id": project_id, "name": "Task C", "duration": 4}).json()
    tD = client.post("/api/tasks", json={"project_id": project_id, "name": "Task D", "duration": 5}).json()

    for child, parent in [(tB["id"], tA["id"]), (tC["id"], tA["id"]), (tD["id"], tB["id"]), (tD["id"], tC["id"])]:
        client.post("/api/dependencies", json={"project_id": project_id, "task_id": child, "depends_on_id": parent})

    # Case 1: Delay critical Task B by 3 days
    impact_b = client.get(f"/api/projects/{project_id}/tasks/{tB['id']}/delay-impact?delay_days=3").json()
    assert impact_b["is_behind_schedule"] is True
    assert impact_b["available_slack"] == 0.0
    assert impact_b["slack_consumed"] == 0.0
    assert impact_b["project_completion_impact"] == 3.0
    assert tD["id"] in impact_b["downstream_affected_task_ids"]

    # Case 2: Delay non-critical Task C by 4 days (within available slack of 6)
    impact_c1 = client.get(f"/api/projects/{project_id}/tasks/{tC['id']}/delay-impact?delay_days=4").json()
    assert impact_c1["available_slack"] == 6.0
    assert impact_c1["slack_consumed"] == 4.0
    assert impact_c1["project_completion_impact"] == 0.0
    assert impact_c1["is_behind_schedule"] is False

    # Case 3: Delay non-critical Task C by 8 days (exceeds slack by 2)
    impact_c2 = client.get(f"/api/projects/{project_id}/tasks/{tC['id']}/delay-impact?delay_days=8").json()
    assert impact_c2["available_slack"] == 6.0
    assert impact_c2["slack_consumed"] == 6.0
    assert impact_c2["project_completion_impact"] == 2.0
    assert impact_c2["is_behind_schedule"] is True
    assert impact_c2["critical_path_changed"] is True

    # Case 4: Negative delay rejected
    neg_resp = client.get(f"/api/projects/{project_id}/tasks/{tC['id']}/delay-impact?delay_days=-2")
    assert neg_resp.status_code == 400


# ---------------------------------------------------------------------------
# 5. Risk Management Tests
# ---------------------------------------------------------------------------

def test_risk_crud_and_deterministic_scoring(client):
    """
    Verifies risk creation, deterministic scoring (Likelihood * Impact),
    category assignment (Low: 1-4, Medium: 5-9, High: 10-16, Critical: 17-25),
    update, listing, retrieval, deletion, and summary.
    """
    p_resp = client.post("/api/projects", json={"name": "Smelter Modernization"})
    project_id = p_resp.json()["id"]

    t_resp = client.post("/api/tasks", json={
        "project_id": project_id,
        "name": "High Voltage Transformer Hookup",
        "duration": 7
    })
    task_id = t_resp.json()["id"]

    # 1. Low risk: 2 * 2 = 4 -> Low
    r_low = client.post(f"/api/projects/{project_id}/risks", json={
        "title": "Minor paint supply delay",
        "likelihood": 2,
        "impact": 2
    }).json()
    assert r_low["score"] == 4
    assert r_low["category"] == "Low"

    # 2. Medium risk: 3 * 3 = 9 -> Medium
    r_med = client.post(f"/api/projects/{project_id}/risks", json={
        "title": "Crane operator availability",
        "likelihood": 3,
        "impact": 3
    }).json()
    assert r_med["score"] == 9
    assert r_med["category"] == "Medium"

    # 3. High risk: 4 * 3 = 12 -> High
    r_high = client.post(f"/api/projects/{project_id}/risks", json={
        "title": "Transformer delivery customs clearance",
        "task_id": task_id,
        "likelihood": 4,
        "impact": 3,
        "mitigation": "Expedited customs broker retained"
    }).json()
    assert r_high["score"] == 12
    assert r_high["category"] == "High"
    assert r_high["task_id"] == task_id

    # 4. Critical risk: 5 * 5 = 25 -> Critical
    r_crit = client.post(f"/api/projects/{project_id}/risks", json={
        "title": "Grid connection permit rejection",
        "likelihood": 5,
        "impact": 5
    }).json()
    assert r_crit["score"] == 25
    assert r_crit["category"] == "Critical"

    # 5. List project risks
    list_resp = client.get(f"/api/projects/{project_id}/risks")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 4

    # 6. Get single risk
    get_resp = client.get(f"/api/projects/{project_id}/risks/{r_high['id']}")
    assert get_resp.status_code == 200
    assert get_resp.json()["title"] == "Transformer delivery customs clearance"

    # 7. Update risk
    upd_resp = client.put(f"/api/projects/{project_id}/risks/{r_low['id']}", json={
        "likelihood": 5,
        "impact": 4
    })
    assert upd_resp.status_code == 200
    upd_data = upd_resp.json()
    assert upd_data["score"] == 20
    assert upd_data["category"] == "Critical"

    # 8. Risk Summary endpoint
    sum_resp = client.get(f"/api/projects/{project_id}/risks/summary")
    assert sum_resp.status_code == 200
    summary = sum_resp.json()
    assert summary["total_risks"] == 4
    assert summary["critical_count"] == 2  # r_crit and updated r_low
    assert summary["high_count"] == 1
    assert summary["medium_count"] == 1
    assert summary["low_count"] == 0
    assert summary["max_score"] == 25

    # 9. Delete risk
    del_resp = client.delete(f"/api/projects/{project_id}/risks/{r_crit['id']}")
    assert del_resp.status_code == 204

    # Confirm deletion
    assert client.get(f"/api/projects/{project_id}/risks/{r_crit['id']}").status_code == 404


def test_risk_validation_and_cross_project_integrity(client):
    """
    Verifies out-of-range likelihood/impact values are rejected and cross-project task links fail with 400.
    """
    p1 = client.post("/api/projects", json={"name": "Project Alpha"}).json()
    p2 = client.post("/api/projects", json={"name": "Project Beta"}).json()

    t2 = client.post("/api/tasks", json={
        "project_id": p2["id"],
        "name": "Beta Calibration",
        "duration": 5
    }).json()

    # Out of range likelihood (>5)
    r1 = client.post(f"/api/projects/{p1['id']}/risks", json={
        "title": "Invalid Risk",
        "likelihood": 6,
        "impact": 3
    })
    assert r1.status_code == 422

    # Out of range impact (<1)
    r2 = client.post(f"/api/projects/{p1['id']}/risks", json={
        "title": "Invalid Risk 2",
        "likelihood": 2,
        "impact": 0
    })
    assert r2.status_code == 422

    # Linking risk in p1 with task in p2 -> HTTP 400
    r3 = client.post(f"/api/projects/{p1['id']}/risks", json={
        "title": "Mismatched Task Risk",
        "task_id": t2["id"],
        "likelihood": 3,
        "impact": 3
    })
    assert r3.status_code == 400
    assert "does not belong to project" in r3.json()["detail"].lower()


# ---------------------------------------------------------------------------
# 6. What-If Delay Simulation Tests
# ---------------------------------------------------------------------------

def test_what_if_simulation_multi_task_and_immutability(client):
    """
    Verifies multi-task hypothetical delay simulation, project delay calculation,
    and ensures the database state (tasks and schedules) is completely unmutated.
    """
    p_resp = client.post("/api/projects", json={"name": "Steel Rolling Mill Upgrade"})
    project_id = p_resp.json()["id"]

    # Chain of 3 tasks: T1 (10) -> T2 (15) -> T3 (10). Total = 35.
    t1 = client.post("/api/tasks", json={"project_id": project_id, "name": "Civil Work", "duration": 10}).json()
    t2 = client.post("/api/tasks", json={"project_id": project_id, "name": "Mill Installation", "duration": 15}).json()
    t3 = client.post("/api/tasks", json={"project_id": project_id, "name": "Commissioning", "duration": 10}).json()

    client.post("/api/dependencies", json={"project_id": project_id, "task_id": t2["id"], "depends_on_id": t1["id"]})
    client.post("/api/dependencies", json={"project_id": project_id, "task_id": t3["id"], "depends_on_id": t2["id"]})

    # 1. Zero delay simulation
    sim_zero = client.post(f"/api/projects/{project_id}/simulate", json={
        "delays": []
    }).json()
    assert sim_zero["baseline_duration"] == 35.0
    assert sim_zero["simulated_duration"] == 35.0
    assert sim_zero["project_delay"] == 0.0

    # 2. Multi-task simulation: delay T1 by 5 days, delay T2 by 3 days
    sim_multi = client.post(f"/api/projects/{project_id}/simulate", json={
        "delays": [
            {"task_id": t1["id"], "delay_days": 5.0},
            {"task_id": t2["id"], "delay_days": 3.0}
        ]
    }).json()

    assert sim_multi["baseline_duration"] == 35.0
    assert sim_multi["simulated_duration"] == 43.0
    assert sim_multi["project_delay"] == 8.0
    assert len(sim_multi["task_impacts"]) == 3

    # Check T3 impact: started 8 days later, finished 8 days later
    t3_impact = next(ti for ti in sim_multi["task_impacts"] if ti["task_id"] == t3["id"])
    assert t3_impact["start_delay"] == 8.0
    assert t3_impact["finish_delay"] == 8.0

    # 3. Database immutability verification: task records must remain with original durations
    get_t1 = client.get(f"/api/tasks/{t1['id']}").json()
    get_t2 = client.get(f"/api/tasks/{t2['id']}").json()
    assert get_t1["duration"] == 10
    assert get_t2["duration"] == 15

    # Baseline schedule in DB remains 35
    sched = client.get(f"/api/projects/{project_id}/schedule").json()
    assert sched["total_duration"] == 35.0


def test_what_if_simulation_validations(client):
    """
    Verifies that simulation requests reject negative delays and foreign tasks.
    """
    p1 = client.post("/api/projects", json={"name": "Project 1"}).json()
    p2 = client.post("/api/projects", json={"name": "Project 2"}).json()

    t1 = client.post("/api/tasks", json={"project_id": p1["id"], "name": "T1", "duration": 5}).json()
    t2 = client.post("/api/tasks", json={"project_id": p2["id"], "name": "T2", "duration": 5}).json()

    # Negative delay
    r_neg = client.post(f"/api/projects/{p1['id']}/simulate", json={
        "delays": [{"task_id": t1["id"], "delay_days": -4}]
    })
    assert r_neg.status_code == 422 or r_neg.status_code == 400

    # Foreign task
    r_foreign = client.post(f"/api/projects/{p1['id']}/simulate", json={
        "delays": [{"task_id": t2["id"], "delay_days": 3}]
    })
    assert r_foreign.status_code == 400
    assert "does not belong to project" in r_foreign.json()["detail"].lower()


def test_task_progress_reversion_clears_actual_dates(client):
    """
    Verifies that reverting task progress clears completion/start dates appropriately.
    """
    p = client.post("/api/projects", json={"name": "Reversible Process Project"}).json()
    t = client.post("/api/tasks", json={
        "project_id": p["id"],
        "name": "Quality Audit",
        "duration": 5,
        "progress": 100
    }).json()

    assert t["status"] == "Done"
    assert t["actual_end_date"] is not None

    # Revert to 50%
    u1 = client.put(f"/api/tasks/{t['id']}", json={"progress": 50}).json()
    assert u1["status"] == "In Progress"
    assert u1["actual_start_date"] is not None
    assert u1["actual_end_date"] is None

    # Revert to 0%
    u2 = client.put(f"/api/tasks/{t['id']}", json={"progress": 0}).json()
    assert u2["status"] == "To Do"
    assert u2["actual_start_date"] is None
    assert u2["actual_end_date"] is None


def test_what_if_simulation_with_pert_option(client):
    """
    Verifies that simulation supports use_pert=True using PERT expected durations.
    """
    p = client.post("/api/projects", json={"name": "PERT Simulation Facility"}).json()
    # Task with O=2, M=5, P=8 -> PERT duration = (2 + 4*5 + 8)/6 = 30/6 = 5.0
    t = client.post("/api/tasks", json={
        "project_id": p["id"],
        "name": "Turbine Balancing",
        "duration": 10,  # Baseline is 10
        "optimistic_duration": 2,
        "most_likely_duration": 5,
        "pessimistic_duration": 8
    }).json()

    # Simulate with use_pert=False -> baseline duration is 10.0
    sim_base = client.post(f"/api/projects/{p['id']}/simulate", json={
        "delays": [{"task_id": t["id"], "delay_days": 2.0}],
        "use_pert": False
    }).json()
    assert sim_base["baseline_duration"] == 10.0
    assert sim_base["simulated_duration"] == 12.0

    # Simulate with use_pert=True -> baseline duration is 5.0
    sim_pert = client.post(f"/api/projects/{p['id']}/simulate", json={
        "delays": [{"task_id": t["id"], "delay_days": 2.0}],
        "use_pert": True
    }).json()
    assert sim_pert["baseline_duration"] == 5.0
    assert sim_pert["simulated_duration"] == 7.0


def test_empty_project_progress_and_forecast_behavior(client):
    """
    Verifies that projects with 0 tasks return graceful empty summaries.
    """
    p = client.post("/api/projects", json={"name": "Empty Plant", "start_date": "2026-01-01"}).json()

    prog = client.get(f"/api/projects/{p['id']}/progress").json()
    assert prog["total_tasks"] == 0
    assert prog["overall_actual_progress"] == 0.0

    fc = client.get(f"/api/projects/{p['id']}/forecast").json()
    assert fc["baseline_duration"] == 0.0
    assert fc["forecast_remaining_duration"] == 0.0

    sim = client.post(f"/api/projects/{p['id']}/simulate", json={"delays": []}).json()
    assert sim["baseline_duration"] == 0.0
    assert sim["simulated_duration"] == 0.0


def test_project_deletion_cascades_risks(client):
    """
    Verifies that deleting a project cascades and deletes all associated risks.
    """
    p = client.post("/api/projects", json={"name": "Temporary Refit"}).json()
    r = client.post(f"/api/projects/{p['id']}/risks", json={
        "title": "Subcontractor default",
        "likelihood": 4,
        "impact": 4
    }).json()

    # Confirm risk exists
    assert client.get(f"/api/projects/{p['id']}/risks/{r['id']}").status_code == 200

    # Delete project
    del_p = client.delete(f"/api/projects/{p['id']}")
    assert del_p.status_code == 204

    # Risk should no longer exist (404)
    assert client.get(f"/api/projects/{p['id']}/risks/{r['id']}").status_code == 404
