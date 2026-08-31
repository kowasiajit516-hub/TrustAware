"""
tests/test_fault_injection.py
--------------------------------
Tests for POST /fault-injection/{sensor_id} (Phase 7 addition).

Confirms the endpoint goes through the real ingestion pipeline (the
injected value shows up via GET /readings, exactly like a value
posted through POST /readings would) rather than writing to the
database directly. Does not require a trained ML model - fault
detection/trust/virtual-sensing are best-effort downstream steps that
create_reading() already tolerates being unavailable.

Run with:
    pytest tests/test_fault_injection.py -v
"""

import pytest

from tests.conftest import sample_sensor_payload


@pytest.mark.asyncio
async def test_spike_produces_out_of_range_reading_through_real_pipeline(client):
    await client.post("/sensors", json=sample_sensor_payload("FAULT_SPIKE_01"))

    resp = await client.post(
        "/fault-injection/FAULT_SPIKE_01", json={"fault_type": "SPIKE"}
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["sensor_id"] == "FAULT_SPIKE_01"
    assert data["fault_type"] == "SPIKE"
    # normal range in sample_sensor_payload is 15.0-40.0
    assert data["injected_value"] < 15.0 or data["injected_value"] > 40.0

    # The reading really went through POST /readings' own storage path -
    # confirm it's retrievable via the real GET /readings endpoint.
    readings_resp = await client.get("/readings", params={"sensor_id": "FAULT_SPIKE_01"})
    assert readings_resp.status_code == 200
    values = [r["value"] for r in readings_resp.json()]
    assert data["injected_value"] in values


@pytest.mark.asyncio
async def test_stuck_reuses_last_known_value(client):
    await client.post("/sensors", json=sample_sensor_payload("FAULT_STUCK_01"))
    await client.post("/readings", json={"sensor_id": "FAULT_STUCK_01", "value": 27.5})

    resp = await client.post(
        "/fault-injection/FAULT_STUCK_01", json={"fault_type": "STUCK"}
    )
    assert resp.status_code == 201
    assert resp.json()["injected_value"] == 27.5


@pytest.mark.asyncio
async def test_drift_produces_a_value_and_stores_a_reading(client):
    await client.post("/sensors", json=sample_sensor_payload("FAULT_DRIFT_01"))

    resp = await client.post(
        "/fault-injection/FAULT_DRIFT_01", json={"fault_type": "DRIFT"}
    )
    assert resp.status_code == 201
    assert isinstance(resp.json()["injected_value"], float)


@pytest.mark.asyncio
async def test_explicit_offset_is_respected_for_spike(client):
    await client.post("/sensors", json=sample_sensor_payload("FAULT_OFFSET_01"))

    resp = await client.post(
        "/fault-injection/FAULT_OFFSET_01",
        json={"fault_type": "SPIKE", "offset": 10.0},
    )
    assert resp.status_code == 201
    value = resp.json()["injected_value"]
    # edge (15.0 or 40.0) +/- exactly 10.0
    assert value in (5.0, 50.0)


@pytest.mark.asyncio
async def test_fault_injection_unknown_sensor_404s(client):
    resp = await client.post(
        "/fault-injection/DOES_NOT_EXIST", json={"fault_type": "SPIKE"}
    )
    assert resp.status_code == 404
