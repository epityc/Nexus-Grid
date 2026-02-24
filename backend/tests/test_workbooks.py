import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_create_workbook(client: AsyncClient, auth_headers: dict):
    response = await client.post("/api/v1/workbooks", json={
        "name": "My Budget",
        "description": "Monthly budget tracker",
    }, headers=auth_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "My Budget"
    assert len(data["sheets"]) == 1
    assert data["sheets"][0]["name"] == "Sheet1"


async def test_list_workbooks(client: AsyncClient, auth_headers: dict):
    await client.post("/api/v1/workbooks", json={"name": "WB1"}, headers=auth_headers)
    await client.post("/api/v1/workbooks", json={"name": "WB2"}, headers=auth_headers)
    response = await client.get("/api/v1/workbooks", headers=auth_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


async def test_get_workbook(client: AsyncClient, auth_headers: dict):
    create = await client.post("/api/v1/workbooks", json={"name": "GetMe"}, headers=auth_headers)
    wb_id = create.json()["id"]
    response = await client.get(f"/api/v1/workbooks/{wb_id}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["id"] == wb_id


async def test_update_workbook(client: AsyncClient, auth_headers: dict):
    create = await client.post("/api/v1/workbooks", json={"name": "OldName"}, headers=auth_headers)
    wb_id = create.json()["id"]
    response = await client.patch(f"/api/v1/workbooks/{wb_id}", json={"name": "NewName"}, headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["name"] == "NewName"


async def test_delete_workbook(client: AsyncClient, auth_headers: dict):
    create = await client.post("/api/v1/workbooks", json={"name": "DeleteMe"}, headers=auth_headers)
    wb_id = create.json()["id"]
    response = await client.delete(f"/api/v1/workbooks/{wb_id}", headers=auth_headers)
    assert response.status_code == 204
    get = await client.get(f"/api/v1/workbooks/{wb_id}", headers=auth_headers)
    assert get.status_code == 404


async def test_workbook_not_found(client: AsyncClient, auth_headers: dict):
    response = await client.get(
        "/api/v1/workbooks/00000000-0000-0000-0000-000000000000",
        headers=auth_headers,
    )
    assert response.status_code == 404
