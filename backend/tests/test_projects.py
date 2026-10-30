def test_create_project_success(client):
    payload = {
        "name": "Robotic Assembly Cell",
        "description": "Procurement and installation of 6-axis robotic arms and safety fencing",
        "status": "Planned",
        "start_date": "2026-11-01",
        "deadline": "2027-02-28",
        "team_size": 5
    }
    response = client.post("/api/projects", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["id"] is not None
    assert data["name"] == "Robotic Assembly Cell"
    assert data["team_size"] == 5
    assert data["tasks_count"] == 0


def test_create_project_invalid_dates(client):
    payload = {
        "name": "Invalid Date Project",
        "start_date": "2026-12-01",
        "deadline": "2026-11-01"
    }
    response = client.post("/api/projects", json=payload)
    assert response.status_code == 422


def test_create_project_empty_name(client):
    payload = {
        "name": ""
    }
    response = client.post("/api/projects", json=payload)
    assert response.status_code == 422


def test_get_project_by_id(client):
    create_resp = client.post("/api/projects", json={"name": "Conveyor System PLC Upgrade"})
    project_id = create_resp.json()["id"]

    response = client.get(f"/api/projects/{project_id}")
    assert response.status_code == 200
    assert response.json()["name"] == "Conveyor System PLC Upgrade"


def test_get_nonexistent_project(client):
    response = client.get("/api/projects/99999")
    assert response.status_code == 404


def test_list_projects_and_filtering(client):
    client.post("/api/projects", json={"name": "PLC Wiring Line 1", "status": "Active"})
    client.post("/api/projects", json={"name": "PLC Wiring Line 2", "status": "Planned"})

    # Filter by status
    resp = client.get("/api/projects?status=Active")
    assert resp.status_code == 200
    items = resp.json()
    assert any(p["name"] == "PLC Wiring Line 1" for p in items)
    assert not any(p["name"] == "PLC Wiring Line 2" for p in items)

    # Search by keyword
    search_resp = client.get("/api/projects?search=Line 2")
    assert search_resp.status_code == 200
    search_items = search_resp.json()
    assert len(search_items) == 1
    assert search_items[0]["name"] == "PLC Wiring Line 2"


def test_update_project(client):
    create_resp = client.post("/api/projects", json={"name": "Initial Name", "status": "Planned"})
    project_id = create_resp.json()["id"]

    update_resp = client.put(f"/api/projects/{project_id}", json={
        "name": "Updated Name",
        "status": "Active",
        "team_size": 8
    })
    assert update_resp.status_code == 200
    assert update_resp.json()["name"] == "Updated Name"
    assert update_resp.json()["status"] == "Active"
    assert update_resp.json()["team_size"] == 8


def test_delete_project_cascades(client):
    # Create project
    p_resp = client.post("/api/projects", json={"name": "Project to Delete"})
    project_id = p_resp.json()["id"]

    # Create task under project
    t_resp = client.post("/api/tasks", json={
        "project_id": project_id,
        "name": "Subtask to be cascaded",
        "duration": 3
    })
    task_id = t_resp.json()["id"]

    # Delete project
    del_resp = client.delete(f"/api/projects/{project_id}")
    assert del_resp.status_code == 204

    # Verify project is gone
    assert client.get(f"/api/projects/{project_id}").status_code == 404

    # Verify task is also gone (cascade)
    assert client.get(f"/api/tasks/{task_id}").status_code == 404
