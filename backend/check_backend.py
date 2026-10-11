"""
check_backend.py - is the backend (local code or the deployed server) really serving the learning / dashboard API?

  python check_backend.py                      # LOCAL: import the app exactly as Render would and list its routes
  python check_backend.py https://YOUR.onrender.com   # REMOTE: ask the running server which routes it has

Why this exists: if a new file is missing or has an import error, the new version FAILS TO START on Render and Render keeps
serving the previous version - which is why the page then reports "GET /learning/<id>/status 404 Not Found".
Exit code 0 = everything required is present, 1 = something is missing (the reason is printed).
"""
from __future__ import annotations

import importlib
import sys
import traceback
from pathlib import Path

REQUIRED_ROUTES = [
    ("GET", "/learning/{sensor_id}/status"), ("POST", "/learning/{sensor_id}/start"), ("POST", "/learning/{sensor_id}/cancel"),
    ("GET", "/learning/{sensor_id}/result"), ("GET", "/learning/{sensor_id}/sessions"), ("GET", "/learning/{sensor_id}/readings"),
    ("GET", "/invalid-readings"), ("POST", "/invalid-readings"), ("GET", "/sensor-processing/{sensor_id}"),
    ("PUT", "/sensor-processing/{sensor_id}"), ("GET", "/dashboard/sensors"), ("GET", "/dashboard/sensors/{sensor_id}/history"),
    ("GET", "/self-healing/{sensor_id}/overview"),
]
REQUIRED_FILES = [
    "main.py", "models/learning.py", "models/trusted_reading.py", "routes/learning.py", "routes/dashboard.py",
    "services/learning_service.py", "services/learning_analysis.py", "services/learning_stats.py", "services/measurement_profiles.py",
    "services/signal_processing.py", "services/healing_overview.py", "services/dashboard_service.py", "services/reading_service.py",
    "services/virtual_sensor.py", "services/trust_engine.py", "services/fault_detection.py",
]


def missing_routes(available: set[tuple[str, str]]) -> list[tuple[str, str]]:
    """available: {(METHOD, path)} - returns the required routes that are not in it."""
    return [r for r in REQUIRED_ROUTES if r not in available]


def routes_from_openapi(spec: dict) -> set[tuple[str, str]]:
    return {(m.upper(), path) for path, ops in (spec.get("paths") or {}).items() for m in ops if m.lower() in ("get", "post", "put", "patch", "delete")}


def check_local(root: Path) -> int:
    absent = [f for f in REQUIRED_FILES if not (root / f).exists()]
    if absent:
        print("MISSING FILES (copy them into the project, then commit and push):")
        for f in absent:
            print("   -", f)
        return 1
    sys.path.insert(0, str(root))
    try:
        main = importlib.import_module("main")
    except Exception:  # noqa: BLE001
        print("The app FAILS TO IMPORT - this is exactly what makes Render keep the old version:\n")
        traceback.print_exc()
        return 1
    # Read the route table from the OpenAPI document: it works on every FastAPI version, unlike app.routes internals.
    gone = missing_routes(routes_from_openapi(main.app.openapi()))
    if gone:
        print("The app starts, but these routes are NOT registered (check main.py include_router lines):")
        for m, p in gone:
            print(f"   - {m} {p}")
        return 1
    print(f"OK: the app imports and all {len(REQUIRED_ROUTES)} required routes are registered.")
    return 0


def check_remote(url: str) -> int:
    import requests

    url = url.rstrip("/")
    try:
        health = requests.get(f"{url}/health", timeout=90)
        print(f"GET /health -> {health.status_code}", health.json() if health.ok else health.text[:200])
        spec = requests.get(f"{url}/openapi.json", timeout=90).json()
    except Exception as exc:  # noqa: BLE001
        print(f"Cannot reach {url}: {exc}\n(a free Render instance can take ~60 s to wake up - try again)")
        return 1
    gone = missing_routes(routes_from_openapi(spec))
    if gone:
        print("\nThe DEPLOYED server is an OLD version. Missing:")
        for m, p in gone:
            print(f"   - {m} {p}")
        print("\nPush the latest backend (git add/commit/push) and read the Render deploy log for the error that stopped it.")
        return 1
    print(f"\nOK: the deployed server has all {len(REQUIRED_ROUTES)} required routes.")
    return 0


if __name__ == "__main__":
    sys.exit(check_remote(sys.argv[1]) if len(sys.argv) > 1 else check_local(Path(__file__).resolve().parent))
