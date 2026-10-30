"""
Area B Audit: Comprehensive Dependency and Cycle Detection Edge Cases.
"""

def test_multistep_indirect_cycle_detection(client):
    """
    Verifies cycle detection on multi-step indirect paths:
    A -> B -> C -> D -> E -> A must be blocked with 400.
    """
    p = client.post("/api/projects", json={"name": "Long Chain Cycle"}).json()["id"]
    tasks = [
        client.post("/api/tasks", json={"project_id": p, "name": f"Task {name}"}).json()["id"]
        for name in ["A", "B", "C", "D", "E"]
    ]
    tA, tB, tC, tD, tE = tasks

    # Build chain: A precedes B, B precedes C, C precedes D, D precedes E
    client.post("/api/dependencies", json={"task_id": tB, "depends_on_id": tA})
    client.post("/api/dependencies", json={"task_id": tC, "depends_on_id": tB})
    client.post("/api/dependencies", json={"task_id": tD, "depends_on_id": tC})
    client.post("/api/dependencies", json={"task_id": tE, "depends_on_id": tD})

    # Now attempt to make A depend on E -> cycle!
    resp = client.post("/api/dependencies", json={"task_id": tA, "depends_on_id": tE})
    assert resp.status_code == 400
    assert "circular dependency detected" in resp.json()["detail"].lower()


def test_failed_dependency_operation_leaves_graph_unmodified(client):
    """
    When an invalid dependency creation fails (e.g. cycle),
    the dependency graph must remain exactly as it was beforehand.
    """
    p = client.post("/api/projects", json={"name": "Graph Invariance Project"}).json()["id"]
    t1 = client.post("/api/tasks", json={"project_id": p, "name": "Task 1"}).json()["id"]
    t2 = client.post("/api/tasks", json={"project_id": p, "name": "Task 2"}).json()["id"]

    dep1 = client.post("/api/dependencies", json={"task_id": t2, "depends_on_id": t1}).json()

    # Attempt to create direct cycle: t1 depends on t2
    fail_resp = client.post("/api/dependencies", json={"task_id": t1, "depends_on_id": t2})
    assert fail_resp.status_code == 400

    # Verify only 1 dependency exists in project
    deps = client.get(f"/api/projects/{p}/dependencies").json()
    assert len(deps) == 1
    assert deps[0]["id"] == dep1["id"]


def test_dependency_nonexistent_ids(client):
    """Dependency creation with non-existent task IDs must return 404."""
    p = client.post("/api/projects", json={"name": "Nonexistent Tasks Plant"}).json()["id"]
    t = client.post("/api/tasks", json={"project_id": p, "name": "Real Task"}).json()["id"]

    # Non-existent successor
    r1 = client.post("/api/dependencies", json={"task_id": 99999, "depends_on_id": t})
    assert r1.status_code == 404

    # Non-existent predecessor
    r2 = client.post("/api/dependencies", json={"task_id": t, "depends_on_id": 99999})
    assert r2.status_code == 404


def test_dependency_cross_project_rejected_via_task_endpoint(client):
    """
    Adding a dependency via POST /api/tasks/{task_id}/dependencies where predecessor
    is in a different project must be rejected with 400.
    """
    p1 = client.post("/api/projects", json={"name": "Plant 1"}).json()["id"]
    p2 = client.post("/api/projects", json={"name": "Plant 2"}).json()["id"]

    t1 = client.post("/api/tasks", json={"project_id": p1, "name": "Task Plant 1"}).json()["id"]
    t2 = client.post("/api/tasks", json={"project_id": p2, "name": "Task Plant 2"}).json()["id"]

    resp = client.post(f"/api/tasks/{t1}/dependencies", json={"depends_on_id": t2})
    assert resp.status_code == 400
    assert "cross-project" in resp.json()["detail"].lower()


def test_dependency_duplicate_rejected_via_task_endpoint(client):
    """
    Adding duplicate dependency via POST /api/tasks/{task_id}/dependencies must return 409.
    """
    p = client.post("/api/projects", json={"name": "Dup Plant"}).json()["id"]
    t1 = client.post("/api/tasks", json={"project_id": p, "name": "Task A"}).json()["id"]
    t2 = client.post("/api/tasks", json={"project_id": p, "name": "Task B"}).json()["id"]

    r1 = client.post(f"/api/tasks/{t2}/dependencies", json={"depends_on_id": t1})
    assert r1.status_code == 201

    r2 = client.post(f"/api/tasks/{t2}/dependencies", json={"depends_on_id": t1})
    assert r2.status_code == 409


def test_delete_nonexistent_dependency_returns_404(client):
    """Deleting a non-existent dependency ID must return 404."""
    resp = client.delete("/api/dependencies/999999")
    assert resp.status_code == 404


def test_dependency_persistence_and_retrieval(client):
    """
    Verifies that dependencies are correctly retrievable via project dependencies,
    task dependencies, and global dependencies endpoints.
    """
    p = client.post("/api/projects", json={"name": "Persistence Verification"}).json()["id"]
    t1 = client.post("/api/tasks", json={"project_id": p, "name": "T1"}).json()["id"]
    t2 = client.post("/api/tasks", json={"project_id": p, "name": "T2"}).json()["id"]
    t3 = client.post("/api/tasks", json={"project_id": p, "name": "T3"}).json()["id"]

    d1 = client.post("/api/dependencies", json={"task_id": t2, "depends_on_id": t1}).json()
    d2 = client.post("/api/dependencies", json={"task_id": t3, "depends_on_id": t2}).json()

    # Query via project
    p_deps = client.get(f"/api/projects/{p}/dependencies").json()
    assert len(p_deps) == 2
    assert {d["id"] for d in p_deps} == {d1["id"], d2["id"]}

    # Query via task
    t3_deps = client.get(f"/api/tasks/{t3}/dependencies").json()
    assert len(t3_deps) == 1
    assert t3_deps[0]["id"] == d2["id"]

    # Query via global endpoint
    all_deps = client.get(f"/api/dependencies?project_id={p}").json()
    assert len(all_deps) == 2
