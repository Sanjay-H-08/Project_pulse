def test_create_and_get_dependency(client):
    p_resp = client.post("/api/projects", json={"name": "Conveyor Installation Line A"})
    project_id = p_resp.json()["id"]

    t1_resp = client.post("/api/tasks", json={
        "project_id": project_id,
        "name": "Mechanical Structure Assembly"
    })
    t2_resp = client.post("/api/tasks", json={
        "project_id": project_id,
        "name": "Motor and Gearbox Mounting"
    })
    t1_id = t1_resp.json()["id"]
    t2_id = t2_resp.json()["id"]

    # t2 depends on t1
    dep_resp = client.post("/api/dependencies", json={
        "task_id": t2_id,
        "depends_on_id": t1_id,
        "dependency_type": "finish_to_start",
        "lag_days": 1
    })
    assert dep_resp.status_code == 201
    dep_data = dep_resp.json()
    assert dep_data["task_id"] == t2_id
    assert dep_data["depends_on_id"] == t1_id
    assert dep_data["project_id"] == project_id
    assert dep_data["lag_days"] == 1

    # Check task dependencies retrieval
    task_deps_resp = client.get(f"/api/tasks/{t2_id}/dependencies")
    assert task_deps_resp.status_code == 200
    assert len(task_deps_resp.json()) == 1

    # Check project dependencies retrieval
    proj_deps_resp = client.get(f"/api/projects/{project_id}/dependencies")
    assert proj_deps_resp.status_code == 200
    assert len(proj_deps_resp.json()) == 1

    # Check task detail has dependencies populated
    t2_detail = client.get(f"/api/tasks/{t2_id}").json()
    assert t2_detail["dependencies"] == [t1_id]


def test_self_dependency_rejected(client):
    p_resp = client.post("/api/projects", json={"name": "Robotics Project"})
    project_id = p_resp.json()["id"]

    t_resp = client.post("/api/tasks", json={
        "project_id": project_id,
        "name": "Self Dependent Task"
    })
    task_id = t_resp.json()["id"]

    dep_resp = client.post("/api/dependencies", json={
        "task_id": task_id,
        "depends_on_id": task_id
    })
    # Either 400 Bad Request or 422 Unprocessable Entity
    assert dep_resp.status_code in [400, 422]


def test_cross_project_dependency_rejected(client):
    p1 = client.post("/api/projects", json={"name": "Project 1"}).json()["id"]
    p2 = client.post("/api/projects", json={"name": "Project 2"}).json()["id"]

    t1 = client.post("/api/tasks", json={"project_id": p1, "name": "Task in P1"}).json()["id"]
    t2 = client.post("/api/tasks", json={"project_id": p2, "name": "Task in P2"}).json()["id"]

    dep_resp = client.post("/api/dependencies", json={
        "task_id": t2,
        "depends_on_id": t1
    })
    assert dep_resp.status_code == 400
    assert "Cross-project" in dep_resp.json()["detail"] or "project" in dep_resp.json()["detail"].lower()


def test_duplicate_dependency_rejected(client):
    p = client.post("/api/projects", json={"name": "Duplicate Test"}).json()["id"]
    t1 = client.post("/api/tasks", json={"project_id": p, "name": "Task A"}).json()["id"]
    t2 = client.post("/api/tasks", json={"project_id": p, "name": "Task B"}).json()["id"]

    resp1 = client.post("/api/dependencies", json={"task_id": t2, "depends_on_id": t1})
    assert resp1.status_code == 201

    # Second attempt to add the exact same dependency
    resp2 = client.post("/api/dependencies", json={"task_id": t2, "depends_on_id": t1})
    assert resp2.status_code == 409
    assert "already exists" in resp2.json()["detail"].lower()


def test_direct_circular_dependency_rejected(client):
    p = client.post("/api/projects", json={"name": "Direct Cycle Test"}).json()["id"]
    t1 = client.post("/api/tasks", json={"project_id": p, "name": "Task 1"}).json()["id"]
    t2 = client.post("/api/tasks", json={"project_id": p, "name": "Task 2"}).json()["id"]

    # t2 depends on t1 (t1 precedes t2)
    resp1 = client.post("/api/dependencies", json={"task_id": t2, "depends_on_id": t1})
    assert resp1.status_code == 201

    # Attempt t1 depends on t2 (t2 precedes t1) -> immediate cycle!
    resp2 = client.post("/api/dependencies", json={"task_id": t1, "depends_on_id": t2})
    assert resp2.status_code == 400
    assert "circular dependency" in resp2.json()["detail"].lower()


def test_multistep_circular_dependency_rejected(client):
    p = client.post("/api/projects", json={"name": "Multi Cycle Test"}).json()["id"]
    t1 = client.post("/api/tasks", json={"project_id": p, "name": "Step 1"}).json()["id"]
    t2 = client.post("/api/tasks", json={"project_id": p, "name": "Step 2"}).json()["id"]
    t3 = client.post("/api/tasks", json={"project_id": p, "name": "Step 3"}).json()["id"]
    t4 = client.post("/api/tasks", json={"project_id": p, "name": "Step 4"}).json()["id"]

    # 1 -> 2 -> 3 -> 4
    # t2 depends on t1
    assert client.post("/api/dependencies", json={"task_id": t2, "depends_on_id": t1}).status_code == 201
    # t3 depends on t2
    assert client.post("/api/dependencies", json={"task_id": t3, "depends_on_id": t2}).status_code == 201
    # t4 depends on t3
    assert client.post("/api/dependencies", json={"task_id": t4, "depends_on_id": t3}).status_code == 201

    # Attempt: t1 depends on t4 (4 -> 1 creates 1 -> 2 -> 3 -> 4 -> 1)
    cycle_resp = client.post("/api/dependencies", json={"task_id": t1, "depends_on_id": t4})
    assert cycle_resp.status_code == 400
    assert "circular dependency" in cycle_resp.json()["detail"].lower()


def test_valid_dag_diamond_allowed(client):
    # Diamond graph:
    #      t1
    #     /  \
    #    t2   t3
    #     \  /
    #      t4
    p = client.post("/api/projects", json={"name": "Diamond DAG Project"}).json()["id"]
    t1 = client.post("/api/tasks", json={"project_id": p, "name": "Architectural Design"}).json()["id"]
    t2 = client.post("/api/tasks", json={"project_id": p, "name": "Electrical Schematics"}).json()["id"]
    t3 = client.post("/api/tasks", json={"project_id": p, "name": "Mechanical Fabrication"}).json()["id"]
    t4 = client.post("/api/tasks", json={"project_id": p, "name": "System Integration"}).json()["id"]

    # t2 depends on t1
    assert client.post("/api/dependencies", json={"task_id": t2, "depends_on_id": t1}).status_code == 201
    # t3 depends on t1
    assert client.post("/api/dependencies", json={"task_id": t3, "depends_on_id": t1}).status_code == 201
    # t4 depends on t2
    assert client.post("/api/dependencies", json={"task_id": t4, "depends_on_id": t2}).status_code == 201
    # t4 depends on t3 (diamond convergence, valid DAG!)
    resp4 = client.post("/api/dependencies", json={"task_id": t4, "depends_on_id": t3})
    assert resp4.status_code == 201


def test_delete_dependency(client):
    p = client.post("/api/projects", json={"name": "Dep Delete Project"}).json()["id"]
    t1 = client.post("/api/tasks", json={"project_id": p, "name": "Task 1"}).json()["id"]
    t2 = client.post("/api/tasks", json={"project_id": p, "name": "Task 2"}).json()["id"]

    dep = client.post("/api/dependencies", json={"task_id": t2, "depends_on_id": t1}).json()
    dep_id = dep["id"]

    del_resp = client.delete(f"/api/dependencies/{dep_id}")
    assert del_resp.status_code == 204

    # Verify dependency is gone
    assert client.get(f"/api/dependencies/{dep_id}").status_code == 404
