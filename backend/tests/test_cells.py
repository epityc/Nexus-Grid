import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _create_sheet(client: AsyncClient, auth_headers: dict) -> str:
    wb = await client.post("/api/v1/workbooks", json={"name": "CellTest"}, headers=auth_headers)
    return wb.json()["sheets"][0]["id"]


async def test_upsert_and_get_cell(client: AsyncClient, auth_headers: dict):
    sheet_id = await _create_sheet(client, auth_headers)
    put = await client.put(
        f"/api/v1/sheets/{sheet_id}/cells/0/0",
        json={"row": 0, "col": 0, "raw_value": "Hello"},
        headers=auth_headers,
    )
    assert put.status_code == 200
    assert put.json()["raw_value"] == "Hello"
    assert put.json()["cell_type"] == "text"

    cells = await client.get(f"/api/v1/sheets/{sheet_id}/cells", headers=auth_headers)
    assert cells.status_code == 200
    assert len(cells.json()) == 1


async def test_formula_cell_type(client: AsyncClient, auth_headers: dict):
    sheet_id = await _create_sheet(client, auth_headers)
    put = await client.put(
        f"/api/v1/sheets/{sheet_id}/cells/1/1",
        json={"row": 1, "col": 1, "raw_value": "=SUM(A1:A10)"},
        headers=auth_headers,
    )
    assert put.json()["cell_type"] == "formula"


async def test_number_cell_type(client: AsyncClient, auth_headers: dict):
    sheet_id = await _create_sheet(client, auth_headers)
    put = await client.put(
        f"/api/v1/sheets/{sheet_id}/cells/0/1",
        json={"row": 0, "col": 1, "raw_value": "42.5"},
        headers=auth_headers,
    )
    assert put.json()["cell_type"] == "number"


async def test_batch_upsert_cells(client: AsyncClient, auth_headers: dict):
    sheet_id = await _create_sheet(client, auth_headers)
    response = await client.put(
        f"/api/v1/sheets/{sheet_id}/cells",
        json={"cells": [
            {"row": 0, "col": 0, "raw_value": "A"},
            {"row": 0, "col": 1, "raw_value": "B"},
            {"row": 1, "col": 0, "raw_value": "1"},
            {"row": 1, "col": 1, "raw_value": "2"},
        ]},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert len(response.json()) == 4


async def test_delete_cell(client: AsyncClient, auth_headers: dict):
    sheet_id = await _create_sheet(client, auth_headers)
    await client.put(
        f"/api/v1/sheets/{sheet_id}/cells/5/5",
        json={"row": 5, "col": 5, "raw_value": "temp"},
        headers=auth_headers,
    )
    response = await client.delete(f"/api/v1/sheets/{sheet_id}/cells/5/5", headers=auth_headers)
    assert response.status_code == 204
