"""
tests/test_healing_pipeline.py
-------------------------------
Self-healing pipeline rules that need no trained model:
  - recovery verification state machine (trust_engine)
  - real sensor is NOT trusted again until N consecutive valid readings (virtual_sensor)
  - no fabricated virtual values; UNAVAILABLE is stored instead (virtual_sensor)
  - REDUNDANT peer substitution
Uses the project's real `test_db` fixture.
"""
import pytest

from models.sensor import now_utc
from services import trust_engine, virtual_sensor
from tests.conftest import sample_sensor_payload


def _sensor(sid):
    now = now_utc()
    return {**sample_sensor_payload(sid), "status": "HEALTHY", "trust_score": 100.0,
            "created_at": now, "updated_at": now}


def _pred(sid, is_fault, reasons=None):
    return {"id": "p", "sensor_id": sid, "reading_id": "r", "value": 1.0, "timestamp": now_utc(),
            "anomaly_score": 0.0, "is_fault": is_fault, "fault_reasons": reasons or []}


def _reading(sid, value=24.0):
    return {"id": "rid", "sensor_id": sid, "value": value, "timestamp": now_utc()}


@pytest.mark.asyncio
async def test_recovery_state_machine(test_db):
    await test_db["sensors"].insert_one(_sensor("HP_01"))
    h = await trust_engine.update_trust(test_db, _pred("HP_01", True))
    assert (h["sensor_state"], h["recovery_state"]) == ("WARNING", "FAULT")
    for _ in range(2):
        h = await trust_engine.update_trust(test_db, _pred("HP_01", True))
    assert h["sensor_state"] == "FAULT"

    states = []
    for _ in range(40):
        h = await trust_engine.update_trust(test_db, _pred("HP_01", False))
        states.append(h["recovery_state"])
        if h["recovery_state"] == "RECOVERED":
            break
    assert "VERIFYING" in states and states[-1] == "RECOVERED"
    assert h["consecutive_healthy"] >= h["recovery_required"] and h["sensor_state"] == "HEALTHY"
    assert h["trust_score"] >= 90


@pytest.mark.asyncio
async def test_fault_during_verification_restarts_it(test_db):
    await test_db["sensors"].insert_one(_sensor("HP_02"))
    await trust_engine.update_trust(test_db, _pred("HP_02", True))
    await trust_engine.update_trust(test_db, _pred("HP_02", False))
    h = await trust_engine.update_trust(test_db, _pred("HP_02", True))
    assert h["recovery_state"] == "FAULT" and h["consecutive_healthy"] == 0


@pytest.mark.asyncio
async def test_more_evidence_means_bigger_penalty(test_db):
    await test_db["sensors"].insert_one(_sensor("HP_03"))
    await test_db["sensors"].insert_one(_sensor("HP_04"))
    one = await trust_engine.update_trust(test_db, _pred("HP_03", True, ["ISOLATION_FOREST"]))
    three = await trust_engine.update_trust(test_db, _pred("HP_04", True, ["ISOLATION_FOREST", "BASELINE_BREACH", "OUT_OF_RANGE"]))
    assert three["trust_score"] < one["trust_score"]


@pytest.mark.asyncio
async def test_real_sensor_not_trusted_while_verifying(test_db, tmp_path, monkeypatch):
    await test_db["sensors"].insert_one(_sensor("HP_05"))
    monkeypatch.setattr(virtual_sensor, "MODEL_PATH", tmp_path / "missing.joblib")
    virtual_sensor.reload_model()
    # HEALTHY trust band but still VERIFYING -> raw must NOT be returned as trusted
    with pytest.raises(virtual_sensor.VirtualSensorUnavailable):
        await virtual_sensor.compute_trusted_value(test_db, _reading("HP_05", 90.0), "HEALTHY", "VERIFYING")
    # RECOVERED (or never faulted) -> REAL
    ok = await virtual_sensor.compute_trusted_value(test_db, _reading("HP_05", 24.0), "HEALTHY", "RECOVERED")
    assert ok["source"] == "RAW" and ok["trusted_value"] == 24.0 and ok["raw_isolated"] is False


@pytest.mark.asyncio
async def test_real_value_is_the_calibrated_value_when_given(test_db):
    await test_db["sensors"].insert_one(_sensor("HP_06"))
    doc = await virtual_sensor.compute_trusted_value(
        test_db, _reading("HP_06", 24.0), "HEALTHY", "NORMAL", {"calibrated_value": 24.5, "filtered_value": 24.2})
    assert (doc["raw_value"], doc["calibrated_value"], doc["filtered_value"], doc["trusted_value"]) == (24.0, 24.5, 24.2, 24.5)


@pytest.mark.asyncio
async def test_unavailable_is_stored_not_fabricated(test_db):
    await test_db["sensors"].insert_one(_sensor("HP_07"))
    doc = await virtual_sensor.record_unavailable(test_db, _reading("HP_07", 90.0), "FAULTY", "FAULT", "no history")
    assert doc["trusted_value"] is None and doc["available"] is False and doc["source"] == "UNAVAILABLE"
    assert doc["raw_value"] == 90.0 and doc["raw_isolated"] is True


@pytest.mark.asyncio
async def test_redundant_peer_substitutes_only_when_declared_and_healthy(test_db):
    await test_db["sensors"].insert_one(_sensor("HP_08"))
    await test_db["sensors"].insert_one(_sensor("HP_09"))
    await virtual_sensor.compute_trusted_value(test_db, _reading("HP_09", 25.5), "HEALTHY", "NORMAL")
    await trust_engine.update_trust(test_db, _pred("HP_09", False))   # peer has a healthy sensor_health snapshot

    # not declared -> no redundant substitution (falls to model path, which is absent here)
    with pytest.raises(virtual_sensor.VirtualSensorUnavailable):
        await virtual_sensor.compute_trusted_value(test_db, _reading("HP_08", 90.0), "FAULTY", "FAULT")

    await test_db["sensor_processing"].insert_one({"sensor_id": "HP_08", "redundant_with": ["HP_09"]})
    doc = await virtual_sensor.compute_trusted_value(test_db, _reading("HP_08", 90.0), "FAULTY", "FAULT")
    assert doc["source"] == "REDUNDANT" and doc["trusted_value"] == 25.5 and doc["redundant_sources"] == ["HP_09"]
