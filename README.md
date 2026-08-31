# Trust-Aware Self-Healing for IoT Sensor Networks Using Machine Learning and Virtual Sensing

A dynamic IoT platform where users add any sensor/actuator type through the UI (no code
changes), where an ML pipeline (Isolation Forest -> Trust Score -> Random Forest virtual
sensing) detects faulty sensors, keeps the system alive using predicted "trusted" values,
and drives actuators (fan/LED/buzzer/pump/etc.) based ONLY on trusted values - never raw
faulty ones.

---

## ⚠️ ELECTRICAL SAFETY WARNING

**This project is designed for LOW-VOLTAGE hardware only.**

- Only use 5V/12V DC loads: small DC fans, LEDs, low-voltage buzzers, low-voltage water
  pumps, and appropriately rated low-voltage relay modules or MOSFET drivers.
- **NEVER connect this system directly to AC mains (110V/220V) power.**
- If you ever want to switch an AC-mains appliance, that requires a properly rated,
  certified relay/contactor module installed by someone qualified to do so, with correct
  isolation and fusing - this is outside the scope of this student project and is not
  demonstrated or endorsed here.
- Double-check all wiring before powering on. When in doubt, don't.

---

## Project Status

**Current Phase: Phase 1 — MongoDB + FastAPI + Dynamic Sensor/Actuator/Node/Automation-Rule CRUD**

Implemented in this phase:
- MongoDB connection (Motor async driver) with automatic index creation
- FastAPI app with full CRUD for Sensors, Actuators, Nodes, and Automation Rules
- Manual actuator control (`ON` / `OFF` / `AUTO`) with event history logging
- Environment-based configuration (no hardcoded secrets)
- Structured logging
- Input validation (Pydantic + business-rule checks like duplicate IDs, missing references)
- 34 automated tests, all passing, against a real isolated test database

**Not yet implemented** (scoped for later phases per the Master Plan):
Simulator (Phase 2), Isolation Forest fault detection (Phase 3), dynamic trust scoring
(Phase 4), Random Forest virtual sensing (Phase 5), self-healing engine (Phase 6),
dashboard (Phase 7), ESP32 communication (Phase 8), full automation rule evaluation
(Phase 9).

---

## Tech Stack

- **Backend:** Python 3.11, FastAPI, Motor (async MongoDB driver), Pydantic v2
- **Database:** MongoDB (local or MongoDB Atlas)
- **Testing:** pytest, pytest-asyncio, httpx

---

## Prerequisites

- Python 3.11+ installed
- MongoDB running, either:
  - **Local:** MongoDB Community Server installed and running as a service
    (default: `mongodb://localhost:27017`), or
  - **Cloud:** A free MongoDB Atlas cluster (get a connection string from
    Atlas → Connect → Drivers → Python)

---

## Setup Instructions

### 1. Clone / open the project folder

```bash
cd trust-aware-self-healing-iot/backend
```

### 2. Create and activate a virtual environment

**Windows (PowerShell):**
```powershell
python -m venv venv
venv\Scripts\Activate.ps1
```

**Windows (CMD):**
```cmd
python -m venv venv
venv\Scripts\activate.bat
```

**macOS / Linux:**
```bash
python3 -m venv venv
source venv/bin/activate
```

You should see `(venv)` at the start of your terminal prompt once active.

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure environment variables

Copy `.env.example` to `.env` in the same folder:

```bash
copy .env.example .env      # Windows
cp .env.example .env        # macOS/Linux
```

Edit `.env` and set `MONGODB_URI`:
- Local MongoDB: leave the default `mongodb://localhost:27017`
- MongoDB Atlas: paste your connection string, e.g.
  `mongodb+srv://<username>:<password>@<cluster-url>/?retryWrites=true&w=majority`

**Never commit your real `.env` file to git.**

### 5. Run the backend

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Then open:
- **http://localhost:8000/docs** — interactive Swagger UI (test every endpoint here)
- **http://localhost:8000/health** — health check

### 6. Run the tests

```bash
pytest -v
```

This runs 34 tests against a real, isolated MongoDB test database
(`trust_aware_iot_test`) — it does not touch your real data.

---

## API Overview (Phase 1)

| Group | Endpoints |
|---|---|
| Sensors | `POST/GET /sensors`, `GET/PUT/DELETE /sensors/{sensor_id}`, `PATCH /sensors/{sensor_id}/enable`, `PATCH /sensors/{sensor_id}/disable` |
| Actuators | `POST/GET /actuators`, `GET/PUT/DELETE /actuators/{actuator_id}`, `POST /actuators/{actuator_id}/command`, `PATCH .../enable`, `PATCH .../disable` |
| Nodes | `POST/GET /nodes`, `GET/PUT/DELETE /nodes/{node_id}` |
| Automation Rules | `POST/GET /automation-rules`, `GET/PUT/DELETE /automation-rules/{rule_id}` |
| Health | `GET /health`, `GET /` |

Full interactive documentation is always available at `/docs` while the server is running.

---

## Project Structure

See `MASTER_PLAN.md` for the full folder structure and 10-phase development plan.

---

## License / Academic Use

This is a Computer Engineering major project built for educational purposes.
