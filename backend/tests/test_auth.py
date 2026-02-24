import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_register_success(client: AsyncClient):
    response = await client.post("/api/v1/auth/register", json={
        "email": "newuser@example.com",
        "username": "newuser",
        "password": "securepass123",
    })
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "newuser@example.com"
    assert data["username"] == "newuser"
    assert "id" in data
    assert "hashed_password" not in data


async def test_register_duplicate_email(client: AsyncClient):
    payload = {"email": "dup@example.com", "username": "dup1", "password": "password123"}
    await client.post("/api/v1/auth/register", json=payload)
    payload["username"] = "dup2"
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 400
    assert "Email already registered" in response.json()["detail"]


async def test_login_success(client: AsyncClient):
    await client.post("/api/v1/auth/register", json={
        "email": "logintest@example.com",
        "username": "logintest",
        "password": "mypassword123",
    })
    response = await client.post("/api/v1/auth/login", json={
        "email": "logintest@example.com",
        "password": "mypassword123",
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


async def test_login_wrong_password(client: AsyncClient):
    await client.post("/api/v1/auth/register", json={
        "email": "wrongpwd@example.com",
        "username": "wrongpwd",
        "password": "correctpass123",
    })
    response = await client.post("/api/v1/auth/login", json={
        "email": "wrongpwd@example.com",
        "password": "wrongpassword",
    })
    assert response.status_code == 401


async def test_refresh_token(client: AsyncClient):
    await client.post("/api/v1/auth/register", json={
        "email": "refresh@example.com",
        "username": "refreshuser",
        "password": "password123",
    })
    login = await client.post("/api/v1/auth/login", json={
        "email": "refresh@example.com",
        "password": "password123",
    })
    refresh_token = login.json()["refresh_token"]
    response = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert response.status_code == 200
    assert "access_token" in response.json()
