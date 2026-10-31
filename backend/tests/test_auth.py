import uuid
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)


def test_auth_registration_and_login():
    unique_email = f"engineer_{uuid.uuid4().hex[:8]}@prognix.ai"
    # 1. Register new user
    user_payload = {
        "email": unique_email,
        "password": "SecurePassword123!",
        "full_name": "Lead Industrial Engineer"
    }
    reg_res = client.post("/api/auth/register", json=user_payload)
    assert reg_res.status_code == 201, reg_res.text
    reg_data = reg_res.json()
    assert "access_token" in reg_data
    assert reg_data["user"]["email"] == unique_email
    assert reg_data["user"]["full_name"] == "Lead Industrial Engineer"
    token = reg_data["access_token"]

    # 2. Duplicate registration fails with 400
    dup_res = client.post("/api/auth/register", json=user_payload)
    assert dup_res.status_code == 400
    assert "already registered" in dup_res.json()["detail"].lower()

    # 3. Short password validation fails with 422
    short_pwd = {
        "email": f"user2_{uuid.uuid4().hex[:8]}@prognix.ai",
        "password": "123",
        "full_name": "User Two"
    }
    res_short = client.post("/api/auth/register", json=short_pwd)
    assert res_short.status_code == 422

    # 4. Login with correct credentials
    login_payload = {
        "email": unique_email,
        "password": "SecurePassword123!"
    }
    login_res = client.post("/api/auth/login", json=login_payload)
    assert login_res.status_code == 200
    login_data = login_res.json()
    assert "access_token" in login_data
    assert login_data["user"]["email"] == unique_email

    # 5. Login with invalid password fails with 401
    bad_login = {
        "email": unique_email,
        "password": "WrongPassword!"
    }
    bad_res = client.post("/api/auth/login", json=bad_login)
    assert bad_res.status_code == 401

    # 6. Access protected /api/auth/me with valid Bearer token
    me_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    assert me_res.json()["email"] == unique_email

    # 7. Access /api/auth/me without token fails with 401
    no_auth_res = client.get("/api/auth/me")
    assert no_auth_res.status_code == 401
