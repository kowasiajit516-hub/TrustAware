"""
API-level tests for sensor learning, invalid-event tracking and the
reference accuracy test. Needs MongoDB (uses the shared conftest fixtures).
Uses a 1 s learning interval and small user-selected targets so the tests are fast.
"""
import asyncio

import pytest

from tests.conftest import sample_sensor_payload


async def _setup(client, sid):
    assert (await client.post("/sensors", json=sample_sensor_payload(sid))).status_code == 201
    r = await client.put(f"/sensor-processing/{sid}", json={"valid_min": -40, "valid_max": 80})
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_learning_counts_only_valid_and_records_invalid(client, test_db):
    sid = "LRN_01"
    await _setup(client, sid)
    r = await client.post(f"/learning/{sid}/start", json={"interval_seconds": 1, "target_valid_readings": 5})
    assert r.status_code == 201

    # valid #1
    assert (await client.post("/readings", json={"sensor_id": sid, "value": 24.0})).status_code == 201
    # out-of-physical-range: stored raw, recorded as fault, NOT counted
    assert (await client.post("/readings", json={"sensor_id": sid, "value": 500.0})).status_code == 201
    # device-reported failure: recorded, NOT counted
    r = await client.post("/invalid-readings", json={"sensor_id": sid, "category": "MISSING_DATA", "reason": "DHT22 NaN"})
    assert r.status_code == 201

    st = (await client.get(f"/learning/{sid}/status")).json()
    assert st["progress"]["reading_number"] == 1
    assert st["progress"]["invalid_events"] == 2
    assert st["baseline_status"] == "COLLECTING"

    more = (24.2, 24.1, 23.9, 24.05)
    for v in more:
        await asyncio.sleep(1.1)
        await client.post("/readings", json={"sensor_id": sid, "value": v})
    vals = (24.0,) + more

    st = (await client.get(f"/learning/{sid}/status")).json()
    assert st["progress"]["reading_number"] == 5
    assert st["progress"]["collection_status"] == "COMPLETE"
    assert st["baseline_status"] == "READY"
    assert st["baseline"]["n"] == 5
    pr = st["progress"]
    assert (pr["target_valid_readings"], pr["valid_readings"], pr["invalid_readings"]) == (5, 5, 2)
    assert pr["fault_events"] == 1 and pr["communication_events"] == 1 and pr["interval_seconds"] == 1
    assert pr["final_quality_score"] == pytest.approx(st["quality"]["score"])
    assert st["baseline"]["mean"] == pytest.approx(sum(vals) / 5)

    q = st["quality"]
    assert q["samples"] == 5 and q["invalid_events"] == 2 and q["formula_version"] == "quality-v2"
    assert q["status"] in ("HEALTHY", "SUSPECT", "UNRELIABLE") and 0 <= q["score"] <= 100
    assert q["average"] == pytest.approx(sum(vals) / 5)

    rows = (await client.get(f"/learning/{sid}/readings")).json()
    assert [x["reading_number"] for x in rows] == [1, 2, 3, 4, 5]
    assert all(x["validity_status"] == "VALID" for x in rows)

    inv = (await client.get("/invalid-readings", params={"sensor_id": sid})).json()
    assert sorted(e["fault_category"] for e in inv) == ["MISSING_DATA", "OUT_OF_RANGE"]
    # raw values are never discarded (rule #8): 6 raw readings stored, incl. the 500.0
    raw = (await client.get("/readings", params={"sensor_id": sid})).json()
    assert 500.0 in [x["value"] for x in raw] and len(raw) == 6


@pytest.mark.asyncio
async def test_existing_ingestion_unchanged_without_limits(client, test_db):
    await client.post("/sensors", json=sample_sensor_payload("LRN_02"))
    r = await client.post("/readings", json={"sensor_id": "LRN_02", "value": 9999.0})
    assert r.status_code == 201  # no physical limits configured -> no rejection, same as before
    assert (await client.get("/invalid-readings", params={"sensor_id": "LRN_02"})).json() == []


@pytest.mark.asyncio
async def test_second_session_rejected_while_running(client, test_db):
    await _setup(client, "LRN_03")
    assert (await client.post("/learning/LRN_03/start", json={})).status_code == 201
    assert (await client.post("/learning/LRN_03/start", json={})).status_code == 409
    assert (await client.post("/learning/LRN_03/cancel")).status_code == 200


@pytest.mark.asyncio
async def test_target_is_user_selected_not_fixed(client, test_db):
    sid = "LRN_05"
    await _setup(client, sid)
    await client.post(f"/learning/{sid}/start", json={"interval_seconds": 1, "target_valid_readings": 4})
    for i in range(3):
        await client.post("/readings", json={"sensor_id": sid, "value": 24.0 + 0.1 * i})
        await asyncio.sleep(1.1)
    st = (await client.get(f"/learning/{sid}/status")).json()
    assert st["progress"]["valid_readings"] == 3 and st["progress"]["collection_status"] == "COLLECTING"  # not stopped at 3 or 30
    await client.post("/readings", json={"sensor_id": sid, "value": 24.3})
    st = (await client.get(f"/learning/{sid}/status")).json()
    assert st["progress"]["collection_status"] == "COMPLETE" and st["quality"]["samples"] == 4


@pytest.mark.asyncio
async def test_old_field_name_and_removed_reference_endpoints(client, test_db):
    await _setup(client, "LRN_06")
    r = await client.post("/learning/LRN_06/start", json={"target_readings": 7})
    assert r.status_code == 201 and r.json()["target_readings"] == 7
    assert (await client.post("/accuracy/LRN_06/start", json={})).status_code == 404   # reference accuracy is gone


@pytest.mark.asyncio
async def test_final_result_is_persisted_and_served(client, test_db):
    sid = "LRN_07"
    await _setup(client, sid)
    await client.post(f"/learning/{sid}/start", json={"interval_seconds": 1, "target_valid_readings": 5})
    for i, v in enumerate((24.0, 24.1, 23.9, 24.2, 24.0)):
        if i:
            await asyncio.sleep(1.1)
        await client.post("/readings", json={"sensor_id": sid, "value": v})

    res = (await client.get(f"/learning/{sid}/result")).json()
    r = res["result"]
    assert res["formula_version"] == "quality-v2" and r["valid_readings"] == 5 == r["target_valid_readings"]
    assert {"statistics", "calibration", "filtering", "baseline", "behaviour", "ai", "communication", "source_history",
            "quality", "trust", "recommended_status", "frozen"} <= set(r)
    assert r["quality"]["score_type"] == "BEHAVIOUR_QUALITY" and r["recommended_status"]["status"] in ("HEALTHY", "SUSPECT", "UNRELIABLE")
    assert (await client.get(f"/learning/{sid}/result")).json() == res                       # identical on every read ("refresh")
    st = (await client.get(f"/learning/{sid}/status")).json()
    assert st["result"]["session_id"] == res["session_id"]
    sessions = (await client.get(f"/learning/{sid}/sessions")).json()
    assert sessions[0]["formula_version"] == "quality-v2" and sessions[0]["valid_readings"] == 5
    stored = await test_db["learning_sessions"].find_one({"session_id": res["session_id"]})
    assert stored["result"]["quality"]["score"] == r["quality"]["score"] and stored["settings"]["filter_method"] == "MEDIAN"
    rows = (await client.get(f"/learning/{sid}/readings")).json()
    assert all("raw_value" in x and "calibrated_value" in x and "filtered_value" in x for x in rows)


@pytest.mark.asyncio
async def test_calibration_and_filter_settings_are_applied_and_validated(client, test_db):
    sid = "LRN_08"
    await _setup(client, sid)
    bad = [{"calibration_gain": 0}, {"filter_alpha": 2}, {"filter_method": "BOGUS"}, {"filter_window": 0}, {"interval_seconds": 0}]
    for extra in bad:
        r = await client.post(f"/learning/{sid}/start", json={"target_valid_readings": 5, **extra})
        assert r.status_code == 422, extra

    r = await client.post(f"/learning/{sid}/start", json={"interval_seconds": 1, "target_valid_readings": 5,
                                                          "calibration_offset": 2.0, "filter_method": "NONE"})
    assert r.status_code == 201 and r.json()["settings"]["calibration_offset"] == 2.0
    raw_vals = (24.0, 24.2, 24.1, 23.9, 24.0)
    for i, v in enumerate(raw_vals):
        if i:
            await asyncio.sleep(1.1)
        await client.post("/readings", json={"sensor_id": sid, "value": v})
    rows = (await client.get(f"/learning/{sid}/readings")).json()
    assert all(x["calibrated_value"] == pytest.approx(x["raw_value"] + 2.0) for x in rows)       # calibration applied
    assert all(x["filtered_value"] == pytest.approx(x["calibrated_value"]) for x in rows)         # NONE filter
    r = (await client.get(f"/learning/{sid}/result")).json()["result"]
    assert r["calibration"]["offset"] == 2.0 and r["calibration"]["applied"] and r["filtering"]["method"] == "NONE"
    assert r["statistics"]["calibrated"]["mean"] == pytest.approx(r["statistics"]["raw"]["mean"] + 2.0)
    assert (await client.get(f"/sensor-processing/{sid}")).json()["calibration_offset"] == 2.0


@pytest.mark.asyncio
async def test_health_advertises_the_learning_api(client):
    r = await client.get("/health")
    assert r.status_code == 200 and r.json()["features"]["learning"] is True


@pytest.mark.asyncio
async def test_status_route_exists_unknown_sensor_vs_not_started(client, test_db):
    # a missing SENSOR is a 404 with a sensor message - not FastAPI's route-missing "Not Found"
    r = await client.get("/learning/NOPE_X/status")
    assert r.status_code == 404 and r.json()["detail"] != "Not Found"
    await _setup(client, "LRN_09")
    s = (await client.get("/learning/LRN_09/status")).json()
    assert s["baseline_status"] == "NOT_STARTED" and s["progress"] is None and s["result"] is None
    assert s["processing"]["filter_method"] == "MEDIAN"
