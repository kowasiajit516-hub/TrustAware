/*
  esp32_node.ino
  ================
  Reference firmware for a real ESP32 node in the Trust-Aware
  Self-Healing IoT Sensor Network project (Phase 8).

  SAFETY: This firmware is for LOW-VOLTAGE DC sensors/actuators only.
  Never wire an ESP32 GPIO pin to AC mains, directly or through a
  relay module that itself switches mains power. See docs/SAFETY.md
  before wiring anything.

  WHAT THIS DOES
  --------------
  1. Connects to WiFi.
  2. Sends a heartbeat to POST /nodes/{NODE_ID}/heartbeat on a fixed
     interval, so the backend's lazy offline-detection (see
     services/node_service.py) marks this node ONLINE.
  3. Reads each configured sensor and POSTs it to /readings - the
     exact same ingestion endpoint the simulator and fault-injection
     use (no shortcuts, per master plan rule #3). The server assigns
     the timestamp.
  4. Polls GET /nodes/{NODE_ID}/commands/pending, applies each pending
     actuator command to the matching GPIO pin, and acknowledges it
     via POST /nodes/{NODE_ID}/commands/{id}/ack. This is the
     RELIABLE command path - it works even if the direct push below
     is missed.
  5. Also runs a tiny local HTTP server on port 80 exposing
     POST /command, so the backend's best-effort direct push
     (backend/esp32/esp32_client.py) can reach this node immediately
     for lower latency. Applying a command twice (once via direct
     push, once via the poll loop) is harmless and intentional - both
     paths are idempotent, and the poll loop always still acks.

  REQUIRED LIBRARIES (Arduino IDE Library Manager)
  --------------------------------------------------
  - WiFi.h            (bundled with the ESP32 board package)
  - HTTPClient.h       (bundled with the ESP32 board package)
  - WebServer.h        (bundled with the ESP32 board package)
  - ArduinoJson         (by Benoit Blanchon - install via Library Manager)

  This file has been PARTIALLY verified: compiled against a real
  arduino-cli + esp32:esp32 core 2.0.9 + ArduinoJson 7.2.1 toolchain.
  One real, toolchain-independent bug was found and fixed (a
  function-pointer struct member, which breaks Arduino's automatic
  function-prototype generation - a documented Arduino IDE gotcha).
  Full compilation could not be completed in that environment: its
  substitute `ctags` binary (Arduino's exact patched ctags fork isn't
  reachable from that sandbox) miscompiles prototype insertion for
  ANY non-void function - confirmed via an isolated one-line
  reproduction unrelated to this file's actual content. This means
  the remaining build errors seen there are a tooling artifact, not a
  confirmed defect - but it also means a full, clean compile has NOT
  been confirmed. Please run Sketch -> Verify/Compile in the real
  Arduino IDE (or `arduino-cli compile` with your own toolchain)
  before flashing, and report back anything that fails.
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <ArduinoJson.h>

// Metric type constants for SensorConfig.metric - used instead of a
// function-pointer struct member. A function-pointer struct field is
// a well-documented Arduino IDE gotcha: it breaks the IDE's automatic
// function-prototype generation for every function that follows it in
// the file. Kept near the includes as good practice, not because
// placement here was found to matter on its own.
#define METRIC_TEMPERATURE_C 0

// ---------------------------------------------------------------
// CONFIGURATION - edit these for your setup
// ---------------------------------------------------------------
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Backend base URL - the machine running `uvicorn main:app` on your LAN
const char* BACKEND_BASE_URL = "http://192.168.1.10:8000";

// Must already exist: created via POST /nodes (dashboard or API) before
// this firmware runs - the firmware does not self-register.
const char* NODE_ID = "ESP32_01";

const unsigned long HEARTBEAT_INTERVAL_MS = 30000;   // 30s
const unsigned long SENSOR_READ_INTERVAL_MS = 5000;  // 5s
const unsigned long COMMAND_POLL_INTERVAL_MS = 5000;  // 5s

// ---------------------------------------------------------------
// SENSOR MAP - one entry per physical sensor on this node.
// sensor_id must already exist (created via POST /sensors) with
// node_id set to NODE_ID above.
// ---------------------------------------------------------------
struct SensorConfig {
  const char* sensor_id;
  int pin;
  int metric;  // one of the METRIC_* constants below
};

float convertReading(int metric, int raw) {
  switch (metric) {
    case METRIC_TEMPERATURE_C: {
      // Placeholder linear mapping - replace with your sensor's real
      // datasheet formula (e.g. thermistor Steinhart-Hart, or an
      // I2C sensor library call instead of analogRead entirely).
      float voltage = (raw / 4095.0) * 3.3;
      return (voltage - 0.5) * 100.0;
    }
    default:
      return 0.0;
  }
}

SensorConfig sensors[] = {
  { "TEMP_01", 34, METRIC_TEMPERATURE_C },
  // Add more sensors here, e.g.:
  // { "HUM_01", 35, METRIC_HUMIDITY_PERCENT },
};
const int NUM_SENSORS = sizeof(sensors) / sizeof(sensors[0]);

// ---------------------------------------------------------------
// ACTUATOR MAP - one entry per physical actuator on this node.
// actuator_id must already exist (created via POST /actuators) with
// node_id set to NODE_ID above.
// LOW-VOLTAGE DC ONLY - see docs/SAFETY.md.
// ---------------------------------------------------------------
struct ActuatorConfig {
  const char* actuator_id;
  int pin;
};

ActuatorConfig actuators[] = {
  { "FAN_01", 26 },
  // Add more actuators here, e.g.:
  // { "LED_01", 27 },
};
const int NUM_ACTUATORS = sizeof(actuators) / sizeof(actuators[0]);

// ---------------------------------------------------------------
WebServer localServer(80);
unsigned long lastHeartbeat = 0;
unsigned long lastSensorRead = 0;
unsigned long lastCommandPoll = 0;

// ---------------------------------------------------------------
void setup() {
  Serial.begin(115200);

  for (int i = 0; i < NUM_ACTUATORS; i++) {
    pinMode(actuators[i].pin, OUTPUT);
    digitalWrite(actuators[i].pin, LOW);
  }

  connectWiFi();

  localServer.on("/command", HTTP_POST, handleDirectPushCommand);
  localServer.begin();
  Serial.println("Local command server listening on port 80");
}

void loop() {
  localServer.handleClient();  // must be called every loop, no blocking delay() calls

  unsigned long now = millis();

  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  if (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
    sendHeartbeat();
    lastHeartbeat = now;
  }

  if (now - lastSensorRead >= SENSOR_READ_INTERVAL_MS) {
    for (int i = 0; i < NUM_SENSORS; i++) {
      postReading(sensors[i]);
    }
    lastSensorRead = now;
  }

  if (now - lastCommandPoll >= COMMAND_POLL_INTERVAL_MS) {
    pollAndApplyPendingCommands();
    lastCommandPoll = now;
  }
}

// ---------------------------------------------------------------
void connectWiFi() {
  Serial.printf("Connecting to WiFi '%s'...\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(250);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\nConnected. IP address: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\nWiFi connection failed - will retry in main loop.");
  }
}

// ---------------------------------------------------------------
void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(BACKEND_BASE_URL) + "/nodes/" + NODE_ID + "/heartbeat";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<128> body;
  body["ip_address"] = WiFi.localIP().toString();
  String payload;
  serializeJson(body, payload);

  int status = http.POST(payload);
  if (status != 200) {
    Serial.printf("Heartbeat failed: HTTP %d\n", status);
  }
  http.end();
}

// ---------------------------------------------------------------
void postReading(const SensorConfig& sensor) {
  if (WiFi.status() != WL_CONNECTED) return;

  int raw = analogRead(sensor.pin);
  float value = convertReading(sensor.metric, raw);

  HTTPClient http;
  String url = String(BACKEND_BASE_URL) + "/readings";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<128> body;
  body["sensor_id"] = sensor.sensor_id;
  body["value"] = value;
  // timestamp intentionally omitted - the server assigns UTC now(),
  // avoiding any need for this firmware to keep an accurate RTC.
  String payload;
  serializeJson(body, payload);

  int status = http.POST(payload);
  if (status != 201) {
    Serial.printf("Reading POST failed for %s: HTTP %d\n", sensor.sensor_id, status);
  }
  http.end();
}

// ---------------------------------------------------------------
void pollAndApplyPendingCommands() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(BACKEND_BASE_URL) + "/nodes/" + NODE_ID + "/commands/pending";
  http.begin(url);

  int status = http.GET();
  if (status != 200) {
    Serial.printf("Command poll failed: HTTP %d\n", status);
    http.end();
    return;
  }

  String responseBody = http.getString();
  http.end();

  // Pending command lists are expected to be small (a handful of manual
  // commands at most); 2048 bytes comfortably covers that.
  DynamicJsonDocument doc(2048);
  DeserializationError err = deserializeJson(doc, responseBody);
  if (err) {
    Serial.printf("Failed to parse pending commands JSON: %s\n", err.c_str());
    return;
  }

  for (JsonObject cmd : doc.as<JsonArray>()) {
    const char* commandId = cmd["id"];
    const char* actuatorId = cmd["actuator_id"];
    const char* command = cmd["command"];

    applyCommandToPin(actuatorId, command);
    acknowledgeCommand(commandId);
  }
}

// ---------------------------------------------------------------
void applyCommandToPin(const char* actuatorId, const char* command) {
  for (int i = 0; i < NUM_ACTUATORS; i++) {
    if (strcmp(actuators[i].actuator_id, actuatorId) == 0) {
      if (strcmp(command, "ON") == 0) {
        digitalWrite(actuators[i].pin, HIGH);
        Serial.printf("Actuator %s -> ON\n", actuatorId);
      } else if (strcmp(command, "OFF") == 0) {
        digitalWrite(actuators[i].pin, LOW);
        Serial.printf("Actuator %s -> OFF\n", actuatorId);
      }
      // AUTO: no direct GPIO action here - Phase 9's automation engine
      // owns AUTO-mode state changes going forward.
      return;
    }
  }
  Serial.printf("No local pin mapping for actuator_id=%s\n", actuatorId);
}

// ---------------------------------------------------------------
void acknowledgeCommand(const char* commandId) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(BACKEND_BASE_URL) + "/nodes/" + NODE_ID + "/commands/" + commandId + "/ack";
  http.begin(url);
  int status = http.POST("");
  if (status != 200) {
    Serial.printf("Ack failed for command %s: HTTP %d\n", commandId, status);
  }
  http.end();
}

// ---------------------------------------------------------------
// Local server handler - the backend's best-effort direct push lands
// here. Applying it immediately is a latency optimization only; the
// poll loop above will still see and ack the same command shortly
// after, which is expected and harmless (idempotent GPIO writes).
// ---------------------------------------------------------------
void handleDirectPushCommand() {
  if (!localServer.hasArg("plain")) {
    localServer.send(400, "application/json", "{\"error\":\"missing body\"}");
    return;
  }

  DynamicJsonDocument doc(256);
  DeserializationError err = deserializeJson(doc, localServer.arg("plain"));
  if (err) {
    localServer.send(400, "application/json", "{\"error\":\"invalid json\"}");
    return;
  }

  const char* actuatorId = doc["actuator_id"];
  const char* command = doc["command"];

  applyCommandToPin(actuatorId, command);

  localServer.send(200, "application/json", "{\"status\":\"applied\"}");
}
