import pytest
from backend.app.algorithms.pert import calculate_pert_expected_duration, validate_pert_estimates, PertValidationError
from backend.app.algorithms.cpm import calculate_cpm, CPMSchedulingError


# ============================================================================
# Pure Algorithm Unit Tests
# ============================================================================

def test_pert_math_pure():
    res = calculate_pert_expected_duration(optimistic=3.0, most_likely=6.0, pessimistic=15.0)
    # Te = (3 + 4*6 + 15) / 6 = 42 / 6 = 7.0
    assert res.expected_duration == 7.0
    # SD = (15 - 3) / 6 = 12 / 6 = 2.0
    assert res.standard_deviation == 2.0
    # Var = 2.0^2 = 4.0
    assert res.variance == 4.0


def test_pert_invalid_order_pure():
    with pytest.raises(PertValidationError):
        validate_pert_estimates(optimistic=10.0, most_likely=5.0, pessimistic=15.0)

    with pytest.raises(PertValidationError):
        validate_pert_estimates(optimistic=5.0, most_likely=15.0, pessimistic=10.0)

    with pytest.raises(PertValidationError):
        validate_pert_estimates(optimistic=-1.0, most_likely=5.0, pessimistic=10.0)


def test_cpm_cycle_detection_pure():
    tasks = {1: ("T1", 5.0), 2: ("T2", 4.0), 3: ("T3", 3.0)}
    # 1 -> 2 -> 3 -> 1
    deps = [(2, 1), (3, 2), (1, 3)]
    with pytest.raises(CPMSchedulingError) as exc_info:
        calculate_cpm(tasks, deps)
    assert "Circular dependency" in str(exc_info.value)


# ============================================================================
# API Integration Tests for 12 Required Scenarios
# ============================================================================

# 1. Simple sequential tasks
def test_simple_sequential_tasks(client):
    p_resp = client.post("/api/projects", json={
        "name": "Factory Foundation & Cleanroom Setup",
        "description": "Sequential structural and cleanroom HVAC deployment"
    })
    project_id = p_resp.json()["id"]

    t1 = client.post("/api/tasks", json={
        "project_id": project_id,
        "name": "Sub-surface Excavation & Concrete Foundation",
        "duration": 10
    }).json()["id"]

    t2 = client.post("/api/tasks", json={
        "project_id": project_id,
        "name": "Cleanroom Structural Framing",
        "duration": 15
    }).json()["id"]

    t3 = client.post("/api/tasks", json={
        "project_id": project_id,
        "name": "HVAC Ducting & HEPA Filtration Installation",
        "duration": 8
    }).json()["id"]

    # t2 depends on t1; t3 depends on t2
    client.post("/api/dependencies", json={"task_id": t2, "depends_on_id": t1})
    client.post("/api/dependencies", json={"task_id": t3, "depends_on_id": t2})

    sched_resp = client.post(f"/api/projects/{project_id}/schedule")
    assert sched_resp.status_code == 200
    data = sched_resp.json()

    assert data["project_id"] == project_id
    assert data["total_duration"] == 33.0
    assert data["critical_path"] == [t1, t2, t3]
    assert data["critical_path_task_ids"] == [t1, t2, t3]

    task_map = {item["task_id"]: item for item in data["tasks"]}
    # t1: ES=0, EF=10, LS=0, LF=10, slack=0
    assert task_map[t1]["early_start"] == 0.0
    assert task_map[t1]["early_finish"] == 10.0
    assert task_map[t1]["late_start"] == 0.0
    assert task_map[t1]["late_finish"] == 10.0
    assert task_map[t1]["slack"] == 0.0
    assert task_map[t1]["is_critical"] is True

    # t2: ES=10, EF=25, LS=10, LF=25, slack=0
    assert task_map[t2]["early_start"] == 10.0
    assert task_map[t2]["early_finish"] == 25.0
    assert task_map[t2]["late_start"] == 10.0
    assert task_map[t2]["late_finish"] == 25.0
    assert task_map[t2]["slack"] == 0.0
    assert task_map[t2]["is_critical"] is True

    # t3: ES=25, EF=33, LS=25, LF=33, slack=0
    assert task_map[t3]["early_start"] == 25.0
    assert task_map[t3]["early_finish"] == 33.0
    assert task_map[t3]["late_start"] == 25.0
    assert task_map[t3]["late_finish"] == 33.0
    assert task_map[t3]["slack"] == 0.0
    assert task_map[t3]["is_critical"] is True


# 2. Independent parallel tasks
def test_independent_parallel_tasks(client):
    p_resp = client.post("/api/projects", json={"name": "Machinery Procurement Program"})
    project_id = p_resp.json()["id"]

    t1 = client.post("/api/tasks", json={
        "project_id": project_id,
        "name": "Procure CNC Milling Machine",
        "duration": 20
    }).json()["id"]

    t2 = client.post("/api/tasks", json={
        "project_id": project_id,
        "name": "Procure Automated Guided Vehicles (AGV)",
        "duration": 12
    }).json()["id"]

    t3 = client.post("/api/tasks", json={
        "project_id": project_id,
        "name": "Procure Buffer Racks",
        "duration": 5
    }).json()["id"]

    sched_resp = client.post(f"/api/projects/{project_id}/schedule")
    assert sched_resp.status_code == 200
    data = sched_resp.json()

    assert data["total_duration"] == 20.0
    assert data["critical_path"] == [t1]
    assert data["critical_path_task_ids"] == [t1]

    task_map = {item["task_id"]: item for item in data["tasks"]}
    # t1: critical
    assert task_map[t1]["slack"] == 0.0
    assert task_map[t1]["is_critical"] is True
    # t2: ES=0, EF=12, LS=8, LF=20, slack=8
    assert task_map[t2]["early_start"] == 0.0
    assert task_map[t2]["early_finish"] == 12.0
    assert task_map[t2]["late_start"] == 8.0
    assert task_map[t2]["late_finish"] == 20.0
    assert task_map[t2]["slack"] == 8.0
    assert task_map[t2]["is_critical"] is False
    # t3: ES=0, EF=5, LS=15, LF=20, slack=15
    assert task_map[t3]["slack"] == 15.0
    assert task_map[t3]["is_critical"] is False


# 3. Multiple dependency branches
def test_multiple_dependency_branches(client):
    p_resp = client.post("/api/projects", json={"name": "Battery Pack Assembly Line"})
    project_id = p_resp.json()["id"]

    # Branch A: t1 (6) -> t2 (8) = 14
    t1 = client.post("/api/tasks", json={"project_id": project_id, "name": "Conveyor Assembly", "duration": 6}).json()["id"]
    t2 = client.post("/api/tasks", json={"project_id": project_id, "name": "Robot Tooling Mount", "duration": 8}).json()["id"]
    # Branch B: t3 (5) -> t4 (4) = 9
    t3 = client.post("/api/tasks", json={"project_id": project_id, "name": "HV Panel Wiring", "duration": 5}).json()["id"]
    t4 = client.post("/api/tasks", json={"project_id": project_id, "name": "Safety Interlocks", "duration": 4}).json()["id"]
    # Merge: t5 (5)
    t5 = client.post("/api/tasks", json={"project_id": project_id, "name": "Cell Commissioning", "duration": 5}).json()["id"]

    client.post("/api/dependencies", json={"task_id": t2, "depends_on_id": t1})
    client.post("/api/dependencies", json={"task_id": t4, "depends_on_id": t3})
    client.post("/api/dependencies", json={"task_id": t5, "depends_on_id": t2})
    client.post("/api/dependencies", json={"task_id": t5, "depends_on_id": t4})

    sched_resp = client.post(f"/api/projects/{project_id}/schedule")
    assert sched_resp.status_code == 200
    data = sched_resp.json()

    assert data["total_duration"] == 19.0
    assert data["critical_path"] == [t1, t2, t5]
    assert data["critical_path_task_ids"] == [t1, t2, t5]

    task_map = {item["task_id"]: item for item in data["tasks"]}
    assert task_map[t3]["slack"] == 5.0
    assert task_map[t4]["slack"] == 5.0
    assert task_map[t1]["slack"] == 0.0
    assert task_map[t2]["slack"] == 0.0
    assert task_map[t5]["slack"] == 0.0


# 4. Diamond-shaped dependency graphs
def test_diamond_dependency_graph(client):
    p_resp = client.post("/api/projects", json={"name": "Paint Shop Upgrade"})
    project_id = p_resp.json()["id"]

    # t1 (4) -> t2 (10) and t3 (6) -> t4 (5)
    t1 = client.post("/api/tasks", json={"project_id": project_id, "name": "Dismantle Spray Booth", "duration": 4}).json()["id"]
    t2 = client.post("/api/tasks", json={"project_id": project_id, "name": "Exhaust Ventilation", "duration": 10}).json()["id"]
    t3 = client.post("/api/tasks", json={"project_id": project_id, "name": "Reciprocator Rails", "duration": 6}).json()["id"]
    t4 = client.post("/api/tasks", json={"project_id": project_id, "name": "Dry Run Calibration", "duration": 5}).json()["id"]

    client.post("/api/dependencies", json={"task_id": t2, "depends_on_id": t1})
    client.post("/api/dependencies", json={"task_id": t3, "depends_on_id": t1})
    client.post("/api/dependencies", json={"task_id": t4, "depends_on_id": t2})
    client.post("/api/dependencies", json={"task_id": t4, "depends_on_id": t3})

    sched_resp = client.post(f"/api/projects/{project_id}/schedule")
    assert sched_resp.status_code == 200
    data = sched_resp.json()

    assert data["total_duration"] == 19.0
    assert data["critical_path"] == [t1, t2, t4]
    task_map = {item["task_id"]: item for item in data["tasks"]}
    assert task_map[t3]["slack"] == 4.0
    assert task_map[t3]["is_critical"] is False
    assert task_map[t2]["slack"] == 0.0
    assert task_map[t2]["is_critical"] is True


# 5. Multiple critical paths
def test_multiple_critical_paths(client):
    p_resp = client.post("/api/projects", json={"name": "Parallel Hydraulic Press Overhaul"})
    project_id = p_resp.json()["id"]

    t1 = client.post("/api/tasks", json={"project_id": project_id, "name": "Lockout Tagout", "duration": 2}).json()["id"]
    t2 = client.post("/api/tasks", json={"project_id": project_id, "name": "Overhaul Press A", "duration": 7}).json()["id"]
    t3 = client.post("/api/tasks", json={"project_id": project_id, "name": "Overhaul Press B", "duration": 7}).json()["id"]
    t4 = client.post("/api/tasks", json={"project_id": project_id, "name": "Re-energization Signoff", "duration": 3}).json()["id"]

    client.post("/api/dependencies", json={"task_id": t2, "depends_on_id": t1})
    client.post("/api/dependencies", json={"task_id": t3, "depends_on_id": t1})
    client.post("/api/dependencies", json={"task_id": t4, "depends_on_id": t2})
    client.post("/api/dependencies", json={"task_id": t4, "depends_on_id": t3})

    sched_resp = client.post(f"/api/projects/{project_id}/schedule")
    assert sched_resp.status_code == 200
    data = sched_resp.json()

    assert data["total_duration"] == 12.0
    assert len(data["critical_paths"]) == 2
    assert [t1, t2, t4] in data["critical_paths"]
    assert [t1, t3, t4] in data["critical_paths"]
    assert sorted(data["critical_path_task_ids"]) == sorted([t1, t2, t3, t4])


# 6. Tasks with non-zero slack
def test_tasks_with_nonzero_slack(client):
    p_resp = client.post("/api/projects", json={"name": "Slack Verification Project"})
    project_id = p_resp.json()["id"]

    t1 = client.post("/api/tasks", json={"project_id": project_id, "name": "Main Path Task 1", "duration": 10}).json()["id"]
    t2 = client.post("/api/tasks", json={"project_id": project_id, "name": "Main Path Task 2", "duration": 10}).json()["id"]
    t_parallel = client.post("/api/tasks", json={"project_id": project_id, "name": "Short Parallel Task", "duration": 4}).json()["id"]

    client.post("/api/dependencies", json={"task_id": t2, "depends_on_id": t1})

    sched_resp = client.post(f"/api/projects/{project_id}/schedule")
    assert sched_resp.status_code == 200
    data = sched_resp.json()

    task_map = {item["task_id"]: item for item in data["tasks"]}
    # t_parallel has ES=0, EF=4, LS=16, LF=20, slack=16
    assert task_map[t_parallel]["slack"] == 16.0
    assert task_map[t_parallel]["late_start"] - task_map[t_parallel]["early_start"] == 16.0
    assert task_map[t_parallel]["late_finish"] - task_map[t_parallel]["early_finish"] == 16.0
    assert task_map[t_parallel]["is_critical"] is False


# 7. Empty projects
def test_empty_project_schedule(client):
    p_resp = client.post("/api/projects", json={"name": "Empty Industrial Project"})
    project_id = p_resp.json()["id"]

    sched_resp = client.post(f"/api/projects/{project_id}/schedule")
    assert sched_resp.status_code == 200
    data = sched_resp.json()

    assert data["project_id"] == project_id
    assert data["total_duration"] == 0.0
    assert data["critical_path"] == []
    assert data["critical_paths"] == []
    assert data["critical_path_task_ids"] == []
    assert data["tasks"] == []

    # GET also returns 200 empty schedule
    get_resp = client.get(f"/api/projects/{project_id}/schedule")
    assert get_resp.status_code == 200
    assert get_resp.json()["total_duration"] == 0.0


# 8. Invalid or circular dependencies
def test_circular_dependency_schedule_rejected(client):
    p_resp = client.post("/api/projects", json={"name": "Cycle Project"})
    project_id = p_resp.json()["id"]

    t1 = client.post("/api/tasks", json={"project_id": project_id, "name": "Task 1", "duration": 5}).json()["id"]
    t2 = client.post("/api/tasks", json={"project_id": project_id, "name": "Task 2", "duration": 5}).json()["id"]

    # When attempting to create a circular dependency directly through dependency service, it fails
    # If a cycle somehow bypassed (or if algorithm is invoked with a cycle), test that scheduling safely rejects it
    from backend.app.algorithms.cpm import calculate_cpm, CPMSchedulingError
    with pytest.raises(CPMSchedulingError):
        calculate_cpm({t1: ("Task 1", 5.0), t2: ("Task 2", 5.0)}, [(t1, t2), (t2, t1)])


# 9. PERT calculations
def test_pert_calculation_in_schedule(client):
    p_resp = client.post("/api/projects", json={"name": "Robotic Tooling PERT Project"})
    project_id = p_resp.json()["id"]

    # Create task with baseline duration 5, and PERT O=4, M=7, P=16 -> Expected = 8.0
    t1 = client.post("/api/tasks", json={
        "project_id": project_id,
        "name": "Robotic Welding Tooling Fabrication",
        "duration": 5,
        "optimistic_duration": 4.0,
        "most_likely_duration": 7.0,
        "pessimistic_duration": 16.0
    }).json()["id"]

    # Create task with baseline duration 10, and PERT O=6, M=12, P=18 -> Expected = 12.0
    t2 = client.post("/api/tasks", json={
        "project_id": project_id,
        "name": "Robotic Cell Calibration & Testing",
        "duration": 10,
        "optimistic_duration": 6.0,
        "most_likely_duration": 12.0,
        "pessimistic_duration": 18.0
    }).json()["id"]

    client.post("/api/dependencies", json={"task_id": t2, "depends_on_id": t1})

    # Schedule without PERT (baseline): 5 + 10 = 15
    baseline_resp = client.post(f"/api/projects/{project_id}/schedule?use_pert=false")
    assert baseline_resp.status_code == 200
    assert baseline_resp.json()["total_duration"] == 15.0

    # Schedule with PERT: Expected Te = 8.0 + 12.0 = 20.0
    pert_resp = client.post(f"/api/projects/{project_id}/schedule?use_pert=true")
    assert pert_resp.status_code == 200
    pert_data = pert_resp.json()

    assert pert_data["use_pert"] is True
    assert pert_data["total_duration"] == 20.0

    task_map = {item["task_id"]: item for item in pert_data["tasks"]}
    assert task_map[t1]["duration"] == 8.0
    assert task_map[t1]["pert_estimate"]["expected_duration"] == 8.0
    assert task_map[t1]["pert_estimate"]["variance"] == 4.0
    assert task_map[t1]["pert_estimate"]["standard_deviation"] == 2.0

    assert task_map[t2]["duration"] == 12.0
    assert task_map[t2]["pert_estimate"]["expected_duration"] == 12.0

    # Verify task original duration was NOT overwritten in database
    t1_check = client.get(f"/api/tasks/{t1}").json()
    assert t1_check["duration"] == 5

    # Test GET /schedule with use_pert returns the persisted PERT schedule
    get_resp = client.get(f"/api/projects/{project_id}/schedule?use_pert=true")
    assert get_resp.status_code == 200
    assert get_resp.json()["total_duration"] == 20.0


# 10. Invalid PERT estimates
def test_invalid_pert_estimates_rejected(client):
    p_resp = client.post("/api/projects", json={"name": "Invalid PERT Project"})
    project_id = p_resp.json()["id"]

    # Attempt to create task where Optimistic > Most Likely (fails schema validation)
    bad_task_resp = client.post("/api/tasks", json={
        "project_id": project_id,
        "name": "Invalid Task",
        "duration": 5,
        "optimistic_duration": 15.0,
        "most_likely_duration": 10.0,
        "pessimistic_duration": 20.0
    })
    assert bad_task_resp.status_code == 422

    # Attempt to create task where Most Likely > Pessimistic (fails schema validation)
    bad_task_resp2 = client.post("/api/tasks", json={
        "project_id": project_id,
        "name": "Invalid Task 2",
        "duration": 5,
        "optimistic_duration": 5.0,
        "most_likely_duration": 25.0,
        "pessimistic_duration": 20.0
    })
    assert bad_task_resp2.status_code == 422

    # Attempt schedule calculation with invalid PERT overrides in POST body
    good_task = client.post("/api/tasks", json={
        "project_id": project_id,
        "name": "Good Task",
        "duration": 5
    }).json()["id"]

    sched_bad_body = client.post(f"/api/projects/{project_id}/schedule", json={
        "use_pert": True,
        "task_pert_estimates": {
            good_task: {
                "optimistic": 20.0,
                "most_likely": 10.0,
                "pessimistic": 30.0
            }
        }
    })
    assert sched_bad_body.status_code in [400, 422]


# 11. Nonexistent projects
def test_nonexistent_project_schedule_returns_404(client):
    post_resp = client.post("/api/projects/99999/schedule")
    assert post_resp.status_code == 404
    assert "not found" in post_resp.json()["detail"].lower()

    get_resp = client.get("/api/projects/99999/schedule")
    assert get_resp.status_code == 404
    assert "not found" in get_resp.json()["detail"].lower()


# 12. Projects with disconnected task groups
def test_disconnected_task_groups(client):
    p_resp = client.post("/api/projects", json={"name": "Facility Multi-System Project"})
    project_id = p_resp.json()["id"]

    # Subsystem 1: t1 (3) -> t2 (4) = 7
    t1 = client.post("/api/tasks", json={"project_id": project_id, "name": "Chilled Water Piping", "duration": 3}).json()["id"]
    t2 = client.post("/api/tasks", json={"project_id": project_id, "name": "Chiller Testing", "duration": 4}).json()["id"]
    client.post("/api/dependencies", json={"task_id": t2, "depends_on_id": t1})

    # Subsystem 2: t3 (5) -> t4 (6) = 11
    t3 = client.post("/api/tasks", json={"project_id": project_id, "name": "Transformer Substation", "duration": 5}).json()["id"]
    t4 = client.post("/api/tasks", json={"project_id": project_id, "name": "Switchgear Commissioning", "duration": 6}).json()["id"]
    client.post("/api/dependencies", json={"task_id": t4, "depends_on_id": t3})

    sched_resp = client.post(f"/api/projects/{project_id}/schedule")
    assert sched_resp.status_code == 200
    data = sched_resp.json()

    assert data["total_duration"] == 11.0
    assert data["critical_path"] == [t3, t4]
    assert data["critical_path_task_ids"] == [t3, t4]

    task_map = {item["task_id"]: item for item in data["tasks"]}
    # Subsystem 2 is critical
    assert task_map[t3]["slack"] == 0.0
    assert task_map[t3]["is_critical"] is True
    assert task_map[t4]["slack"] == 0.0
    assert task_map[t4]["is_critical"] is True

    # Subsystem 1 has float of 4 days (11 - 7 = 4)
    assert task_map[t1]["slack"] == 4.0
    assert task_map[t1]["is_critical"] is False
    assert task_map[t2]["slack"] == 4.0
    assert task_map[t2]["is_critical"] is False


# ============================================================================
# AUDIT TESTS: Schedule Invalidation, PERT Incomplete Policy, Persistence Separation
# ============================================================================

def test_invalidation_when_task_duration_updated(client):
    """
    Audit Test: When a task duration is updated, GET /schedule must reflect
    the new duration and total project duration, never returning stale data.
    """
    p = client.post("/api/projects", json={"name": "Audit Invalidation 1"}).json()["id"]
    t1 = client.post("/api/tasks", json={"project_id": p, "name": "Excavation", "duration": 5}).json()["id"]
    t2 = client.post("/api/tasks", json={"project_id": p, "name": "Piling", "duration": 10}).json()["id"]
    client.post("/api/dependencies", json={"task_id": t2, "depends_on_id": t1})

    # Initial schedule: 5 + 10 = 15
    init_sched = client.post(f"/api/projects/{p}/schedule").json()
    assert init_sched["total_duration"] == 15.0

    # User updates task 1 duration from 5 to 20 days
    client.put(f"/api/tasks/{t1}", json={"duration": 20})

    # GET /schedule must reflect 20 + 10 = 30 days
    fresh_sched = client.get(f"/api/projects/{p}/schedule").json()
    assert fresh_sched["total_duration"] == 30.0
    task_map = {item["task_id"]: item for item in fresh_sched["tasks"]}
    assert task_map[t1]["duration"] == 20.0
    assert task_map[t1]["early_finish"] == 20.0
    assert task_map[t2]["early_start"] == 20.0
    assert task_map[t2]["early_finish"] == 30.0


def test_invalidation_when_task_deleted(client):
    """
    Audit Test: When a task is deleted, GET /schedule must remove it and
    recalculate remaining tasks rather than returning deleted task data.
    """
    p = client.post("/api/projects", json={"name": "Audit Task Delete"}).json()["id"]
    t1 = client.post("/api/tasks", json={"project_id": p, "name": "Task 1", "duration": 10}).json()["id"]
    t2 = client.post("/api/tasks", json={"project_id": p, "name": "Task 2 (to delete)", "duration": 25}).json()["id"]

    # Initial schedule: parallel tasks, duration = 25
    sched1 = client.post(f"/api/projects/{p}/schedule").json()
    assert sched1["total_duration"] == 25.0
    assert len(sched1["tasks"]) == 2

    # Delete task 2
    client.delete(f"/api/tasks/{t2}")

    # GET /schedule must show only Task 1 and duration = 10
    sched2 = client.get(f"/api/projects/{p}/schedule").json()
    assert sched2["total_duration"] == 10.0
    assert len(sched2["tasks"]) == 1
    assert sched2["tasks"][0]["task_id"] == t1


def test_invalidation_when_new_task_added(client):
    """
    Audit Test: When a new task is added after schedule calculation,
    GET /schedule must include the new task.
    """
    p = client.post("/api/projects", json={"name": "Audit Task Add"}).json()["id"]
    t1 = client.post("/api/tasks", json={"project_id": p, "name": "Initial Task", "duration": 6}).json()["id"]

    sched1 = client.post(f"/api/projects/{p}/schedule").json()
    assert sched1["total_duration"] == 6.0
    assert len(sched1["tasks"]) == 1

    # Add second task dependent on first
    t2 = client.post("/api/tasks", json={"project_id": p, "name": "Subsequent Task", "duration": 8}).json()["id"]
    client.post("/api/dependencies", json={"task_id": t2, "depends_on_id": t1})

    # GET /schedule must now report 6 + 8 = 14
    sched2 = client.get(f"/api/projects/{p}/schedule").json()
    assert sched2["total_duration"] == 14.0
    assert len(sched2["tasks"]) == 2
    assert sched2["critical_path"] == [t1, t2]


def test_invalidation_when_dependency_added_and_deleted(client):
    """
    Audit Test: When dependencies are added or removed, GET /schedule must
    re-run topological ordering and update earliest/latest dates immediately.
    """
    p = client.post("/api/projects", json={"name": "Audit Dependency Mutate"}).json()["id"]
    t1 = client.post("/api/tasks", json={"project_id": p, "name": "Task A", "duration": 10}).json()["id"]
    t2 = client.post("/api/tasks", json={"project_id": p, "name": "Task B", "duration": 10}).json()["id"]

    # In parallel: duration = 10
    sched1 = client.post(f"/api/projects/{p}/schedule").json()
    assert sched1["total_duration"] == 10.0

    # Add dependency: T2 depends on T1 -> sequential, duration = 20
    dep = client.post("/api/dependencies", json={"task_id": t2, "depends_on_id": t1}).json()
    dep_id = dep["id"]

    sched2 = client.get(f"/api/projects/{p}/schedule").json()
    assert sched2["total_duration"] == 20.0
    assert sched2["critical_path"] == [t1, t2]

    # Delete dependency: back to parallel, duration = 10
    client.delete(f"/api/dependencies/{dep_id}")

    sched3 = client.get(f"/api/projects/{p}/schedule").json()
    assert sched3["total_duration"] == 10.0


def test_invalidation_when_pert_estimates_updated(client):
    """
    Audit Test: Modifying a task's PERT estimates invalidates the PERT schedule
    and ensures GET /schedule?use_pert=true re-computes Te immediately.
    """
    p = client.post("/api/projects", json={"name": "Audit PERT Update"}).json()["id"]
    t1 = client.post("/api/tasks", json={
        "project_id": p,
        "name": "Robotic Welding",
        "duration": 5,
        "optimistic_duration": 4.0,
        "most_likely_duration": 7.0,
        "pessimistic_duration": 16.0  # Te = (4 + 28 + 16)/6 = 8.0
    }).json()["id"]

    pert_sched1 = client.post(f"/api/projects/{p}/schedule?use_pert=true").json()
    assert pert_sched1["total_duration"] == 8.0

    # Update PERT values: O=6, M=12, P=18 -> Te = (6 + 48 + 18)/6 = 12.0
    client.put(f"/api/tasks/{t1}", json={
        "optimistic_duration": 6.0,
        "most_likely_duration": 12.0,
        "pessimistic_duration": 18.0
    })

    pert_sched2 = client.get(f"/api/projects/{p}/schedule?use_pert=true").json()
    assert pert_sched2["total_duration"] == 12.0
    assert pert_sched2["tasks"][0]["duration"] == 12.0


def test_pert_policy_incomplete_estimates_rejected(client):
    """
    Audit Test: If a task has partial PERT estimates (e.g. O and P provided, but M is None),
    the policy must reject with HTTP 400 and NOT silently substitute misleading values.
    """
    p = client.post("/api/projects", json={"name": "Incomplete PERT Project"}).json()["id"]
    t1 = client.post("/api/tasks", json={"project_id": p, "name": "Task 1", "duration": 5}).json()["id"]

    # Attempt schedule with incomplete PERT (missing most_likely)
    resp = client.post(f"/api/projects/{p}/schedule", json={
        "use_pert": True,
        "task_pert_estimates": {
            t1: {
                "optimistic": 4.0,
                # most_likely is omitted
                "pessimistic": 12.0
            }
        }
    })
    # Schema validation rejects missing field with 422
    assert resp.status_code in [400, 422]


def test_pert_policy_hybrid_some_tasks_with_pert_some_without(client):
    """
    Audit Test: When only some tasks have complete PERT estimates, the scheduler
    computes Te for tasks with PERT, and uses verified baseline duration for tasks
    without PERT, without overwriting original data.
    """
    p = client.post("/api/projects", json={"name": "Hybrid PERT Project"}).json()["id"]

    # Task A has complete PERT: O=2, M=5, P=8 -> Te = (2 + 20 + 8)/6 = 5.0
    tA = client.post("/api/tasks", json={
        "project_id": p,
        "name": "Task A (with PERT)",
        "duration": 3,
        "optimistic_duration": 2.0,
        "most_likely_duration": 5.0,
        "pessimistic_duration": 8.0
    }).json()["id"]

    # Task B has NO PERT estimates -> duration = 7
    tB = client.post("/api/tasks", json={
        "project_id": p,
        "name": "Task B (no PERT)",
        "duration": 7
    }).json()["id"]

    client.post("/api/dependencies", json={"task_id": tB, "depends_on_id": tA})

    sched = client.post(f"/api/projects/{p}/schedule?use_pert=true").json()
    assert sched["total_duration"] == 12.0  # 5.0 (Te) + 7.0 (baseline)

    task_map = {item["task_id"]: item for item in sched["tasks"]}
    assert task_map[tA]["duration"] == 5.0
    assert task_map[tA]["pert_estimate"] is not None
    assert task_map[tA]["pert_estimate"]["expected_duration"] == 5.0

    assert task_map[tB]["duration"] == 7.0
    assert task_map[tB]["pert_estimate"] is None

    # Base durations in DB remain untouched
    assert client.get(f"/api/tasks/{tA}").json()["duration"] == 3
    assert client.get(f"/api/tasks/{tB}").json()["duration"] == 7


def test_pert_policy_no_tasks_have_pert_falls_back_to_baseline(client):
    """
    Audit Test: When use_pert=True is requested on a project where NO tasks have PERT estimates,
    the scheduler uses baseline task durations deterministically with pert_estimate=None.
    """
    p = client.post("/api/projects", json={"name": "No PERT Tasks Project"}).json()["id"]
    t1 = client.post("/api/tasks", json={"project_id": p, "name": "Task 1", "duration": 9}).json()["id"]
    t2 = client.post("/api/tasks", json={"project_id": p, "name": "Task 2", "duration": 11}).json()["id"]
    client.post("/api/dependencies", json={"task_id": t2, "depends_on_id": t1})

    sched = client.post(f"/api/projects/{p}/schedule?use_pert=true").json()
    assert sched["total_duration"] == 20.0
    for item in sched["tasks"]:
        assert item["pert_estimate"] is None


def test_baseline_and_pert_schedules_coexist_independently(client):
    """
    Audit Test: Baseline CPM and PERT schedules are stored independently
    under compound key (project_id, use_pert) and cannot overwrite each other.
    """
    p = client.post("/api/projects", json={"name": "Coexistence Project"}).json()["id"]
    t1 = client.post("/api/tasks", json={
        "project_id": p,
        "name": "Assembly Line Installation",
        "duration": 10,
        "optimistic_duration": 6.0,
        "most_likely_duration": 12.0,
        "pessimistic_duration": 24.0  # Te = (6 + 48 + 24)/6 = 78/6 = 13.0
    }).json()["id"]

    # 1. Calculate Baseline CPM schedule: duration = 10
    base_post = client.post(f"/api/projects/{p}/schedule?use_pert=false").json()
    assert base_post["total_duration"] == 10.0
    assert base_post["use_pert"] is False

    # 2. Calculate PERT CPM schedule: duration = 13
    pert_post = client.post(f"/api/projects/{p}/schedule?use_pert=true").json()
    assert pert_post["total_duration"] == 13.0
    assert pert_post["use_pert"] is True

    # 3. Retrieve Baseline schedule via GET -> must still be 10.0!
    base_get = client.get(f"/api/projects/{p}/schedule?use_pert=false").json()
    assert base_get["total_duration"] == 10.0
    assert base_get["use_pert"] is False

    # 4. Retrieve PERT schedule via GET -> must still be 13.0!
    pert_get = client.get(f"/api/projects/{p}/schedule?use_pert=true").json()
    assert pert_get["total_duration"] == 13.0
    assert pert_get["use_pert"] is True

    # 5. Default GET (no use_pert param) returns Baseline schedule
    default_get = client.get(f"/api/projects/{p}/schedule").json()
    assert default_get["total_duration"] == 10.0
    assert default_get["use_pert"] is False
