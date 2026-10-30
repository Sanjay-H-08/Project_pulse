def test_create_task_success(client):
    p_resp = client.post("/api/projects", json={"name": "Industrial Commissioning Project"})
    project_id = p_resp.json()["id"]

    task_payload = {
        "project_id": project_id,
        "name": "PLC I/O Mapping and Testing",
        "description": "Verify digital and analog I/O wiring against Siemens electrical schematics",
        "duration": 5,
        "start_date": "2026-11-10",
        "end_date": "2026-11-15",
        "status": "In Progress",
        "priority": "High",
        "progress": 25,
        "assignee": "Lead Automation Engineer"
    }
    response = client.post("/api/tasks", json=task_payload)
    assert response.status_code == 201
    data = response.json()
    assert data["id"] is not None
    assert data["project_id"] == project_id
    assert data["name"] == "PLC I/O Mapping and Testing"
    assert data["duration"] == 5
    assert data["progress"] == 25
    assert data["priority"] == "High"
    assert data["dependencies"] == []


def test_create_task_invalid_project(client):
    task_payload = {
        "project_id": 99999,
        "name": "Orphan Task"
    }
    response = client.post("/api/tasks", json=task_payload)
    assert response.status_code == 404


def test_create_task_invalid_progress(client):
    p_resp = client.post("/api/projects", json={"name": "Test Project"})
    project_id = p_resp.json()["id"]

    response = client.post("/api/tasks", json={
        "project_id": project_id,
        "name": "Bad Progress Task",
        "progress": 150
    })
    assert response.status_code == 422


def test_create_task_invalid_dates(client):
    p_resp = client.post("/api/projects", json={"name": "Test Project"})
    project_id = p_resp.json()["id"]

    response = client.post("/api/tasks", json={
        "project_id": project_id,
        "name": "Bad Dates Task",
        "start_date": "2026-11-20",
        "end_date": "2026-11-10"
    })
    assert response.status_code == 422


def test_get_task_by_id(client):
    p_resp = client.post("/api/projects", json={"name": "Test Project"})
    project_id = p_resp.json()["id"]

    t_resp = client.post("/api/tasks", json={
        "project_id": project_id,
        "name": "Emergency Stop Circuit Verification"
    })
    task_id = t_resp.json()["id"]

    get_resp = client.get(f"/api/tasks/{task_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["name"] == "Emergency Stop Circuit Verification"


def test_list_tasks_and_filtering(client):
    p_resp = client.post("/api/projects", json={"name": "Project Alpha"})
    project_id = p_resp.json()["id"]

    client.post("/api/tasks", json={
        "project_id": project_id,
        "name": "Motor Calibration",
        "status": "Done",
        "priority": "Critical"
    })
    client.post("/api/tasks", json={
        "project_id": project_id,
        "name": "Sensor Alignment",
        "status": "To Do",
        "priority": "Low"
    })

    # Filter by project and status
    resp = client.get(f"/api/tasks?project_id={project_id}&status=Done")
    assert resp.status_code == 200
    tasks = resp.json()
    assert len(tasks) == 1
    assert tasks[0]["name"] == "Motor Calibration"

    # Filter by priority
    resp_prio = client.get(f"/api/tasks?project_id={project_id}&priority=Low")
    assert resp_prio.status_code == 200
    assert len(resp_prio.json()) == 1
    assert resp_prio.json()[0]["name"] == "Sensor Alignment"


def test_update_task(client):
    p_resp = client.post("/api/projects", json={"name": "Update Task Project"})
    project_id = p_resp.json()["id"]

    t_resp = client.post("/api/tasks", json={
        "project_id": project_id,
        "name": "Safety Laser Scanner Setup",
        "progress": 0,
        "status": "To Do"
    })
    task_id = t_resp.json()["id"]

    update_resp = client.put(f"/api/tasks/{task_id}", json={
        "progress": 100,
        "status": "Done",
        "assignee": "Safety Specialist"
    })
    assert update_resp.status_code == 200
    assert update_resp.json()["progress"] == 100
    assert update_resp.json()["status"] == "Done"
    assert update_resp.json()["assignee"] == "Safety Specialist"


def test_delete_task(client):
    p_resp = client.post("/api/projects", json={"name": "Delete Task Project"})
    project_id = p_resp.json()["id"]

    t_resp = client.post("/api/tasks", json={
        "project_id": project_id,
        "name": "Temporary Calibration Task"
    })
    task_id = t_resp.json()["id"]

    del_resp = client.delete(f"/api/tasks/{task_id}")
    assert del_resp.status_code == 204
    assert client.get(f"/api/tasks/{task_id}").status_code == 404
