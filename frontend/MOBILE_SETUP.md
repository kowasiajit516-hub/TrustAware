# TrustAware - Android / mobile app interface

Web -> app-style interface. **No backend, ML, trust, virtual-sensing, fault-detection,
ESP32 or auth code was changed.** Desktop (>= 1024px) is unchanged apart from the new
Pipeline + Timeline cards on the Self-Healing page.

## Run it on an Android phone (same Wi-Fi as the PC)
1. Find the PC's LAN IP (`ipconfig` / `ip a`), e.g. `192.168.0.107`.
2. Backend: `uvicorn main:app --host 0.0.0.0 --port 8000`
3. Backend CORS: add `http://<PC-IP>:5173` to the allowed origins behind
   `settings.cors_origins_list`, otherwise every API call from the phone is blocked.
4. Frontend: copy `.env.example` -> `.env`, set `VITE_API_BASE_URL=http://<PC-IP>:8000`
   (if you leave it unset the app now uses the page's own host on port 8000 instead of
   `localhost`), then `npm install && npm run dev` (dev server already listens on the LAN).
5. Windows firewall: allow inbound TCP 5173 and 8000 (Private networks).
6. Phone Chrome: open `http://<PC-IP>:5173`. Menu -> "Add to Home screen".
   (True standalone install needs HTTPS; over plain http you get a home-screen shortcut.)
7. Google Sign-In will not work from a raw LAN IP (Google rejects it). Use email/password, or
   follow "Google Sign-In on a phone" below.

## Layout rule
Below 1024px (Tailwind `lg`) = phone/tablet shell: sidebar hidden, top header + bottom
nav (Overview, Sensors, Actuators, Self-Healing, Automation, More), card lists.
1024px and up = your original desktop layout with tables.

## New files
components: MobileNav, MobileHeader, SensorCard, ActuatorCard, NodeCard,
AutomationRuleCard, ActuatorControl, Toggle, PipelineStepper
pages: SensorDetails (/sensors/:id), NodeDetails (/nodes/:id), FaultInjection (/fault-injection)
other: mobile.css, utils/format.js, hooks/useMediaQuery.js, public/manifest.webmanifest, public/icons/*

## Modified files (all small, additive)
App.jsx (3 routes + shell), main.jsx (1 import), index.html, vite.config.js, .env.example,
api/client.js (fallback base URL only), components/Topbar.jsx (1 class),
components/FaultInjectionPanel.jsx (2 optional props),
pages: Sensors, Actuators, Nodes, Automation, FaultHistory, ActuatorHistory, Overview,
SelfHealing, SensorManagement, ActuatorManagement.

## Things the backend does not support (so the UI does not pretend to)
| Requested | Reality in the current backend |
|---|---|
| Sensor / actuator GPIO pin, description | No such fields on the models |
| Hardware sensor types (DHT22, MQ-2, ...) | `sensor_type` enum is the 14 generic types |
| Node MAC, firmware, Wi-Fi RSSI, uptime, WARNING status | Node has only ip_address, status (ONLINE/OFFLINE/UNKNOWN), last_seen |
| SUSPECT sensor status | Statuses are HEALTHY / RECOVERING / FAULTY / OFFLINE |
| `!=` operator, Set Value / Alarm / Notification actions, rule "last triggered" | Rules have 5 operators, ON/OFF actions, no trigger timestamp |
| Actuator FAULT state, Set Value | Actuator state is ON/OFF, mode AUTO/MANUAL |
| CLEAR FAULT | No endpoint: an injection is one bad reading; recovery is automatic |
| Node "Restart" control | Not implemented in the backend |
Each needs a backend schema/endpoint first; ask and I will add the UI once it exists.

## Other notes
- Timestamps: new code treats a timestamp without a timezone as UTC. If your existing pages
  show times off by your UTC offset, that is the same cause (naive UTC datetimes) - existing
  pages were left as they were.
- Not visible to me: `hooks/usePolling.js`, `tailwind.config.js`, `services/`. I stubbed the
  first two only in my test harness; the shipped files never touch them.

## Google Sign-In on a phone (https tunnel)
Google only accepts https:// origins (or http://localhost), never a LAN IP.
One-time:
1. Create a free ngrok account, install ngrok, run `ngrok config add-authtoken <TOKEN>`.
2. ngrok dashboard -> Domains -> create your free static domain
   (looks like `name.ngrok-free.app` or `name.ngrok-free.dev`).
3. Google Cloud Console -> APIs & Services -> Credentials -> your Web OAuth client ->
   Authorized JavaScript origins -> add `https://<your-domain>` (no path, no trailing
   slash) -> Save. Allow a few minutes. If the consent screen is in "Testing", add your
   Gmail under Test users.
4. Backend `.env`: `GOOGLE_CLIENT_ID` must be the same client ID as `VITE_GOOGLE_CLIENT_ID`.
5. Frontend `.env`: `VITE_API_BASE_URL=/api`. Restart `npm run dev`.
Every session:
6. Start MongoDB, the backend, and `npm run dev`.
7. `ngrok http --domain=<your-domain> 5173`   (tunnel the FRONTEND port only)
8. On the phone open `https://<your-domain>` (accept ngrok's one-time warning page),
   then "Continue with Google".
