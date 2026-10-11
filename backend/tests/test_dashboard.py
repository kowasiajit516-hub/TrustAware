"""
API tests for GET /dashboard/sensors: every registered sensor is returned (no 6-sensor style limit),
multi-value devices group into one card, and invalid / device-reported faults stay visible.
Needs MongoDB (shared conftest fixtures).
"""
import pytest

from tests.conftest import sample_sensor_payload


async def _make(client, sid, **over):
    p = {**sample_sensor_payload(sid), **over}
    assert (await client.post("/sensors", json=p)).status_code == 201


@pytest.mark.asyncio
async def test_dashboard_returns_every_registered_sensor(client, test_db):
    ids = [f"DASH_{i:02d}" for i in range(9)]            # more than the old limit of 6
    for sid in ids:
        await _make(client, sid)
    for sid in ids[:7]:
        assert (await client.post("/readings", json={"sensor_id": sid, "value": 24.0})).status_code == 201

    dash = (await client.get("/dashboard/sensors")).json()
    assert [s["sensor_id"] for s in dash["sensors"]] == sorted(ids)
    assert dash["counts"]["sensors"] == len(ids) == len((await client.get("/sensors")).json())
    by = {s["sensor_id"]: s for s in dash["sensors"]}
    assert by["DASH_00"]["raw_value"] == 24.0 and by["DASH_00"]["data_state"] == "LIVE"
    assert by["DASH_08"]["data_state"] == "NO_DATA" and by["DASH_08"]["measurement_issue"]   # listed, marked, not hidden


@pytest.mark.asyncio
async def test_device_grouping_and_fault_history(client, test_db):
    await _make(client, "DHT_T", sensor_type="TEMPERATURE")
    await _make(client, "DHT_H", sensor_type="HUMIDITY", unit="%", normal_min=0.0, normal_max=100.0)
    for sid in ("DHT_T", "DHT_H"):
        r = await client.put(f"/dashboard/sensors/{sid}/device", json={"device_group": "DHT22_A", "device_model": "DHT22"})
        assert r.status_code == 200
    await client.post("/readings", json={"sensor_id": "DHT_T", "value": 24.0})
    await client.post("/readings", json={"sensor_id": "DHT_H", "value": 50.0})
    await client.post("/invalid-readings", json={"sensor_id": "DHT_H", "category": "MISSING_DATA", "reason": "DHT22 NaN"})

    dash = (await client.get("/dashboard/sensors")).json()
    dev = {d["device_id"]: d for d in dash["devices"]}
    assert {s["sensor_id"] for s in dev["DHT22_A"]["sensors"]} == {"DHT_T", "DHT_H"} and dev["DHT22_A"]["model"] == "DHT22"
    hum = next(s for s in dev["DHT22_A"]["sensors"] if s["sensor_id"] == "DHT_H")
    assert "MISSING_DATA" in hum["measurement_issue"] and hum["raw_value"] == 50.0       # fault shown, last value kept

    hist = (await client.get("/dashboard/sensors/DHT_H/history")).json()
    kinds = {h["kind"] for h in hist}
    assert kinds == {"READING", "FAULT"}


@pytest.mark.asyncio
async def test_history_404_for_unknown_sensor(client, test_db):
    assert (await client.get("/dashboard/sensors/NOPE/history")).status_code == 404


@pytest.mark.asyncio
async def test_one_malformed_sensor_never_hides_the_others(client, test_db):
    await _make(client, "OK_1")
    await client.post("/readings", json={"sensor_id": "OK_1", "value": 24.0})
    # a document the normal API would never create (bad interval) - written straight to the collection
    await test_db["sensors"].insert_one({**sample_sensor_payload("BROKEN_1"), "sampling_interval_seconds": "abc",
                                         "status": "HEALTHY", "trust_score": 100.0})
    r = await client.get("/dashboard/sensors")
    assert r.status_code == 200
    by = {s["sensor_id"]: s for s in r.json()["sensors"]}
    assert set(by) == {"OK_1", "BROKEN_1"}
    assert by["OK_1"]["data_state"] == "LIVE"
    assert by["BROKEN_1"]["data_state"] == "ERROR" and by["BROKEN_1"]["sensor_state"] is None   # shown as an error, not healthy
    assert r.json()["counts"]["error"] == 1
