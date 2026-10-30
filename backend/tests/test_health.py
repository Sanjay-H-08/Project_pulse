def test_health_check_endpoint(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "projectpulse-backend"
    assert data["database"] == "connected"
    assert "version" in data


def test_health_check_alias(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_root_endpoint(client):
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "welcome" in data["message"].lower()
    assert data["docs"] == "/docs"
    assert data["health"] == "/api/health"
