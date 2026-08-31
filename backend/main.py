"""
main.py
-------
FastAPI application entrypoint.

Wires together:
- logging setup
- MongoDB connection lifecycle (connect on startup, close on shutdown)
- CORS
- all routers: sensors, actuators, nodes, automation-rules, readings,
  predictions, sensor-health, trusted-readings, fault-events,
  actuator-events, auth, fault-injection

Run with:
    uvicorn main:app --reload --host 0.0.0.0 --port 8000

Then open:
    http://localhost:8000/docs   (interactive Swagger UI)
    http://localhost:8000/health (basic health check)
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import connect_to_mongo, close_mongo_connection
from utils.logger import setup_logging

from routes.sensors import router as sensors_router
from routes.actuators import router as actuators_router
from routes.nodes import router as nodes_router
from routes.automation_rules import router as automation_rules_router
from routes.readings import router as readings_router
from routes.predictions import router as predictions_router
from routes.sensor_health import router as sensor_health_router
from routes.trusted_readings import router as trusted_readings_router
from routes.fault_events import router as fault_events_router
from routes.actuator_events import router as actuator_events_router
from routes.auth import router as auth_router
from routes.fault_injection import router as fault_injection_router

setup_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ---- Startup ----
    logger.info("Starting Trust-Aware Self-Healing IoT backend (env=%s)", settings.app_env)
    await connect_to_mongo()
    yield
    # ---- Shutdown ----
    await close_mongo_connection()
    logger.info("Backend shutdown complete")


app = FastAPI(
    title="Trust-Aware Self-Healing for IoT Sensor Networks",
    description=(
        "Using Machine Learning and Virtual Sensing. "
        "Phase 9: the automation engine now closes the core pipeline - "
        "RAW SENSOR -> VALIDATION -> AI FAULT DETECTION -> DYNAMIC TRUST "
        "SCORE -> VIRTUAL SENSOR -> TRUSTED VALUE -> AUTOMATION ENGINE -> "
        "ACTUATOR. services/automation.py evaluates every enabled "
        "automation_rules document against the sensor's latest TRUSTED "
        "value only (never raw) and drives actuator state through the new "
        "services/actuator.py, which only ever touches actuators already "
        "in AUTO mode - a human's MANUAL command via "
        "POST /actuators/{id}/command always takes precedence and is "
        "never overridden by automation. Rules support optional "
        "hysteresis (reset_threshold/reset_action) to avoid ON/OFF "
        "flapping right at a single threshold. Automated state changes "
        "are recorded in actuator_events with sensor_id and trusted_value "
        "populated, and best-effort dispatched to the actuator's ESP32 "
        "node exactly like a manual command (Phase 8)."
    ),
    version="0.9.0-phase9",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------
# Routers
# ---------------------------------------------------
app.include_router(sensors_router)
app.include_router(actuators_router)
app.include_router(nodes_router)
app.include_router(automation_rules_router)
app.include_router(readings_router)
app.include_router(predictions_router)
app.include_router(sensor_health_router)
app.include_router(trusted_readings_router)
app.include_router(fault_events_router)
app.include_router(actuator_events_router)
app.include_router(auth_router)
app.include_router(fault_injection_router)


@app.get("/health", tags=["Health"])
async def health_check():
    """Basic health check endpoint - confirms the API process is up."""
    return {
        "status": "ok",
        "service": "trust-aware-self-healing-iot-backend",
        "phase": "Phase 9",
        "env": settings.app_env,
    }


@app.get("/", tags=["Health"])
async def root():
    return {
        "message": "Trust-Aware Self-Healing for IoT Sensor Networks - API is running",
        "docs": "/docs",
    }
