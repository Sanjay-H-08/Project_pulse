import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def test_ai_prompts_endpoint():
    response = client.get("/api/ai/prompts")
    assert response.status_code == 200
    prompts = response.json()
    assert isinstance(prompts, list)
    assert len(prompts) >= 5

def test_ai_chat_current_project():
    # Query about CPM
    response = client.post("/api/ai/chat", json={
        "message": "What is the critical path for this project?",
        "project_id": 1
    })
    assert response.status_code == 200
    data = response.json()
    assert "reply" in data
    assert "Critical Path" in data["reply"]
    assert data["source"] in ["gemini", "expert_engine"]

def test_ai_chat_general_project():
    # Query about an external project
    response = client.post("/api/ai/chat", json={
        "message": "How do I manage risk on a hospital construction project?"
    })
    assert response.status_code == 200
    data = response.json()
    assert "reply" in data
    assert "Hospital" in data["reply"] or "Risk" in data["reply"]

def test_ai_chat_scope_creep():
    response = client.post("/api/ai/chat", json={
        "message": "How do I handle scope creep on my project?"
    })
    assert response.status_code == 200
    data = response.json()
    assert "Scope Creep" in data["reply"]
