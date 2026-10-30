"""
Area A Audit: Comprehensive Project and Task CRUD Edge Cases.
"""

def test_project_create_whitespace_name_rejected(client):
    """Whitespace-only project name must be rejected with 422."""
    resp = client.post("/api/projects", json={"name": "   \t  \n "})
    assert resp.status_code == 422


def test_task_create_whitespace_name_rejected(client):
    """Whitespace-only task name must be rejected with 422."""
    p = client.post("/api/projects", json={"name": "Validation Plant"}).json()
    resp = client.post("/api/tasks", json={
        "project_id": p["id"],
        "name": "   "
    })
    assert resp.status_code == 422


def test_project_create_invalid_status_rejected(client):
    """Unknown project status must be rejected with 422."""
    resp = client.post("/api/projects", json={
        "name": "Invalid Status Plant",
        "status": "InTheClouds"
    })
    assert resp.status_code == 422


def test_task_create_invalid_status_rejected(client):
    """Unknown task status must be rejected with 422."""
    p = client.post("/api/projects", json={"name": "Status Test Plant"}).json()
    resp = client.post("/api/tasks", json={
        "project_id": p["id"],
        "name": "Testing Status",
        "status": "PendingVerification"
    })
    assert resp.status_code == 422


def test_task_create_invalid_priority_rejected(client):
    """Unknown task priority must be rejected with 422."""
    p = client.post("/api/projects", json={"name": "Priority Test Plant"}).json()
    resp = client.post("/api/tasks", json={
        "project_id": p["id"],
        "name": "Testing Priority",
        "priority": "SuperUrgent"
    })
    assert resp.status_code == 422


def test_task_create_zero_and_negative_duration_rejected(client):
    """Task duration must be an integer >= 1."""
    p = client.post("/api/projects", json={"name": "Duration Plant"}).json()
    r_zero = client.post("/api/tasks", json={
        "project_id": p["id"],
        "name": "Zero Duration",
        "duration": 0
    })
    assert r_zero.status_code == 422

    r_neg = client.post("/api/tasks", json={
        "project_id": p["id"],
        "name": "Negative Duration",
        "duration": -3
    })
    assert r_neg.status_code == 422


def test_task_create_negative_progress_and_over_100_rejected(client):
    """Task progress must be within [0, 100]."""
    p = client.post("/api/projects", json={"name": "Progress Bounds Plant"}).json()
    r_neg = client.post("/api/tasks", json={
        "project_id": p["id"],
        "name": "Negative Progress",
        "progress": -10
    })
    assert r_neg.status_code == 422

    r_over = client.post("/api/tasks", json={
        "project_id": p["id"],
        "name": "Over 100 Progress",
        "progress": 105
    })
    assert r_over.status_code == 422


def test_task_create_invalid_date_format_rejected(client):
    """Invalid calendar date format must be rejected with 422."""
    p = client.post("/api/projects", json={"name": "Date Format Plant"}).json()
    resp = client.post("/api/tasks", json={
        "project_id": p["id"],
        "name": "Bad Date Task",
        "start_date": "not-a-date"
    })
    assert resp.status_code == 422


def test_task_create_end_date_before_start_date_rejected(client):
    """Task planned end date cannot precede start date."""
    p = client.post("/api/projects", json={"name": "Date Order Plant"}).json()
    resp = client.post("/api/tasks", json={
        "project_id": p["id"],
        "name": "Reverse Dates Task",
        "start_date": "2026-06-15",
        "end_date": "2026-06-10"
    })
    assert resp.status_code == 422


def test_project_partial_update_date_conflict_rejected(client):
    """Updating only deadline to be earlier than existing start_date must be rejected."""
    p = client.post("/api/projects", json={
        "name": "Partial Date Project",
        "start_date": "2026-06-01",
        "deadline": "2026-07-01"
    }).json()

    # Attempt to set deadline earlier than start_date
    resp = client.patch(f"/api/projects/{p['id']}", json={
        "deadline": "2026-05-15"
    })
    assert resp.status_code == 400
    assert "deadline cannot be earlier" in resp.json()["detail"].lower()


def test_task_partial_update_date_conflict_rejected(client):
    """Updating only end_date to be earlier than existing start_date must be rejected."""
    p = client.post("/api/projects", json={"name": "Task Date Check"}).json()
    t = client.post("/api/tasks", json={
        "project_id": p["id"],
        "name": "Task 1",
        "start_date": "2026-06-01",
        "end_date": "2026-06-10"
    }).json()

    resp = client.patch(f"/api/tasks/{t['id']}", json={
        "end_date": "2026-05-20"
    })
    assert resp.status_code == 400
    assert "task end date cannot be earlier" in resp.json()["detail"].lower()


def test_task_partial_update_pert_conflict_rejected(client):
    """Updating only optimistic duration to exceed existing most_likely must be rejected."""
    p = client.post("/api/projects", json={"name": "PERT Partial Check"}).json()
    t = client.post("/api/tasks", json={
        "project_id": p["id"],
        "name": "PERT Task",
        "duration": 5,
        "optimistic_duration": 3,
        "most_likely_duration": 5,
        "pessimistic_duration": 8
    }).json()

    resp = client.patch(f"/api/tasks/{t['id']}", json={
        "optimistic_duration": 6  # 6 > 5 (most_likely)
    })
    assert resp.status_code == 400
    assert "cannot exceed most likely duration" in resp.json()["detail"].lower()


def test_task_move_to_another_project_blocked_if_dependencies_exist(client):
    """A task with dependencies cannot be moved to another project."""
    p1 = client.post("/api/projects", json={"name": "Project Alpha"}).json()
    p2 = client.post("/api/projects", json={"name": "Project Beta"}).json()

    t1 = client.post("/api/tasks", json={"project_id": p1["id"], "name": "Task 1"}).json()
    t2 = client.post("/api/tasks", json={"project_id": p1["id"], "name": "Task 2"}).json()

    client.post("/api/dependencies", json={
        "task_id": t2["id"],
        "depends_on_id": t1["id"]
    })

    # Attempt to move t2 to p2
    resp = client.patch(f"/api/tasks/{t2['id']}", json={"project_id": p2["id"]})
    assert resp.status_code == 400
    assert "active dependencies" in resp.json()["detail"].lower()


def test_task_move_to_another_project_succeeds_without_dependencies(client):
    """A standalone task can be safely moved to another project."""
    p1 = client.post("/api/projects", json={"name": "Origin Project"}).json()
    p2 = client.post("/api/projects", json={"name": "Destination Project"}).json()

    t = client.post("/api/tasks", json={"project_id": p1["id"], "name": "Movable Task"}).json()

    # Move task
    resp = client.patch(f"/api/tasks/{t['id']}", json={"project_id": p2["id"]})
    assert resp.status_code == 200
    assert resp.json()["project_id"] == p2["id"]

    # Verify task counts updated in both projects
    p1_check = client.get(f"/api/projects/{p1['id']}").json()
    p2_check = client.get(f"/api/projects/{p2['id']}").json()
    assert p1_check["tasks_count"] == 0
    assert p2_check["tasks_count"] == 1


def test_task_create_with_invalid_prerequisite_leaves_no_partial_task(client):
    """
    If task creation specifies an invalid prerequisite, the entire operation fails
    and DOES NOT leave an orphaned task committed to the database (atomicity check).
    """
    p = client.post("/api/projects", json={"name": "Atomic Rollback Project"}).json()

    # Attempt to create task with non-existent prerequisite
    resp = client.post("/api/tasks", json={
        "project_id": p["id"],
        "name": "Ghost Dependency Task",
        "duration": 5,
        "depends_on_ids": [99999]
    })
    assert resp.status_code == 404

    # Verify no tasks were created in project
    tasks = client.get(f"/api/projects/{p['id']}/tasks").json()
    assert len(tasks) == 0

    p_check = client.get(f"/api/projects/{p['id']}").json()
    assert p_check["tasks_count"] == 0


def test_project_tasks_count_consistency_after_crud(client):
    """tasks_count in ProjectResponse must accurately track creations and deletions."""
    p = client.post("/api/projects", json={"name": "Task Count Monitoring"}).json()
    assert p["tasks_count"] == 0

    t1 = client.post("/api/tasks", json={"project_id": p["id"], "name": "Task 1"}).json()
    t2 = client.post("/api/tasks", json={"project_id": p["id"], "name": "Task 2"}).json()

    p_after_add = client.get(f"/api/projects/{p['id']}").json()
    assert p_after_add["tasks_count"] == 2

    client.delete(f"/api/tasks/{t1['id']}")
    p_after_del = client.get(f"/api/projects/{p['id']}").json()
    assert p_after_del["tasks_count"] == 1


def test_delete_task_with_dependents_cascades_dependencies_cleanly(client):
    """
    When a prerequisite task is deleted, the dependency record is cascaded/deleted,
    and the dependent task remains valid with an updated schedule.
    """
    p = client.post("/api/projects", json={"name": "Cascade Dependency Plant"}).json()
    t1 = client.post("/api/tasks", json={"project_id": p["id"], "name": "Foundation"}).json()
    t2 = client.post("/api/tasks", json={"project_id": p["id"], "name": "Framing"}).json()

    dep = client.post("/api/dependencies", json={
        "task_id": t2["id"],
        "depends_on_id": t1["id"]
    }).json()

    # Confirm dependency exists
    assert client.get(f"/api/dependencies/{dep['id']}").status_code == 200

    # Delete t1
    del_resp = client.delete(f"/api/tasks/{t1['id']}")
    assert del_resp.status_code == 204

    # Dependency record should be gone
    assert client.get(f"/api/dependencies/{dep['id']}").status_code == 404

    # t2 should still exist and have 0 dependencies
    t2_resp = client.get(f"/api/tasks/{t2['id']}")
    assert t2_resp.status_code == 200
    assert len(t2_resp.json()["dependencies"]) == 0
