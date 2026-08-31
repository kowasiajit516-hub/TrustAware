# SAFETY.md
## Trust-Aware Self-Healing for IoT Sensor Networks Using Machine Learning and Virtual Sensing

> Electrical safety notice — read this before wiring any hardware to
> this project. This document is required by the master plan's
> non-negotiable rule #9 and is referenced from the project README.

---

## 1. LOW-VOLTAGE ONLY — NO AC MAINS

**This project is designed to sense and switch low-voltage DC circuits
only (typically 3.3V–24V DC). It must never be wired to control AC
mains power (110V/230V household or building electrical supply)
directly.**

This applies to every actuator type the project supports (Fan, LED,
Buzzer, Pump, Relay, Motor, Light, Valve, Servo, Custom) and to every
ESP32 GPIO pin used for sensing or actuation.

- Do **not** wire an ESP32 GPIO pin directly to an AC-mains device,
  AC relay coil rated for mains switching, or any mains wiring.
- Do **not** use this project's firmware or backend to drive a relay
  module that is itself switching AC mains loads (e.g. a wall-powered
  lamp, a mains-powered pump, a mains-powered appliance), even if the
  relay module's control side is low-voltage.
- If you want to demonstrate "controlling a lamp" or similar, use a
  low-voltage DC lamp/LED, not a mains light fixture.

If your project genuinely requires switching an AC mains load, that
work is **out of scope for this codebase** and must be done by a
qualified electrician using mains-rated, code-compliant equipment
(certified enclosures, proper fusing/breakers, grounding, and — where
required — an isolated low-voltage control interface such as an
opto-isolated solid-state relay rated and certified for mains
switching). Do not attempt this as a hobbyist extension of the ESP32
firmware in this repository.

---

## 2. WHY THIS MATTERS

- AC mains voltage can cause fatal electric shock, fire, and
  equipment damage.
- The ESP32 (and its GPIO pins) is a low-voltage device. It has no
  mains-rated isolation, insulation, or certification, and was never
  designed to be wired anywhere near mains voltage.
- A software bug, a self-healing "keep the actuator alive on a
  trusted value" decision, or a fault-injection test run against a
  mains-connected actuator is not just a demo glitch — it is a real
  electrical hazard.

---

## 3. SAFE HARDWARE PRACTICES FOR THIS PROJECT

- Power sensors and actuators from a low-voltage DC source: USB
  (5V), a benchtop DC supply, or battery packs within the range your
  specific sensor/actuator is rated for.
- If you use relay modules to switch a device, confirm the **entire
  circuit** the relay switches — not just the relay's control side —
  stays low-voltage DC.
- Double-check the voltage/current rating of every sensor and
  actuator you add through the dashboard's dynamic "Custom" type
  before wiring it; the platform does not restrict what a "Custom"
  entity can be named, but that flexibility does not extend to what
  is electrically safe to wire.
- Keep wiring, breadboards, and connections tidy and insulated; avoid
  exposed conductors, especially in a shared lab space.
- Disconnect power before rewiring any node.

---

## 4. SCOPE OF THIS WARNING

This document, and rule #9 it implements, govern:

- `firmware/esp32_node/esp32_node.ino` (Phase 8)
- `backend/esp32/esp32_client.py` (Phase 8)
- Any actuator command path, whether triggered manually, by the
  automation engine (Phase 9), or by the self-healing pipeline
  (Phase 6) driving a trusted value.

If you extend this project with new hardware, re-read this document
and keep any new wiring low-voltage DC only.
