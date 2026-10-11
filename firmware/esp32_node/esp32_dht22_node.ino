/*
 * esp32_dht22_node.ino  -  DHT22 -> TrustAware backend
 *
 * NOT COMPILED OR RUN by the author of this patch (no ESP32 available) -
 * treat as a starting point and test on your board. If you already have a
 * working node, keep it: it only has to follow the same API contract:
 *   POST /readings          {"sensor_id","value","timestamp"?}   one per good measurement
 *   POST /invalid-readings  {"sensor_id","category","reason","occurred_at"?}  on any failure
 *
 * Libraries: "DHT sensor library" + "Adafruit Unified Sensor" (Library Manager).
 * Low-voltage only. DHT22 data pin -> GPIO 4 (with the module's pull-up).
 * Create two sensors in the dashboard first, e.g. DHT22_TEMP_01 (TEMPERATURE)
 * and DHT22_HUM_01 (HUMIDITY), with sampling_interval_seconds = 10.
 */
#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>
#include <time.h>

const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASS = "YOUR_PASSWORD";
const char* API_BASE  = "http://192.168.0.100:8000";   // PC running uvicorn
const char* TEMP_ID   = "DHT22_TEMP_01";
const char* HUM_ID    = "DHT22_HUM_01";

#define DHT_PIN 4
#define DHT_TYPE DHT22
const unsigned long INTERVAL_MS = 10000;                // one reading every 10 s

DHT dht(DHT_PIN, DHT_TYPE);
unsigned long lastRun = 0;

// A communication failure can only be reported once the link is back, so remember when it started.
bool pendingComm = false;
char pendingSince[25] = "";
int  pendingCount = 0;

bool nowIso(char* out, size_t n) {            // false until NTP has synced
  time_t t = time(nullptr);
  if (t < 1700000000) return false;
  struct tm tmv; gmtime_r(&t, &tmv);
  strftime(out, n, "%Y-%m-%dT%H:%M:%SZ", &tmv);
  return true;
}

int postJson(const char* path, const char* body) {
  if (WiFi.status() != WL_CONNECTED) return -1;
  HTTPClient http;
  String url = String(API_BASE) + path;
  http.begin(url);
  http.setTimeout(4000);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);
  http.end();
  return code;
}

void noteCommFailure() {
  if (!pendingComm) { pendingComm = true; pendingCount = 0; if (!nowIso(pendingSince, sizeof(pendingSince))) pendingSince[0] = 0; }
  pendingCount++;
}

void flushCommFailure() {
  if (!pendingComm) return;
  char body[300];
  if (pendingSince[0])
    snprintf(body, sizeof(body), "{\"sensor_id\":\"%s\",\"category\":\"COMMUNICATION_FAULT\",\"reason\":\"%d reading(s) could not be delivered (WiFi/HTTP failure)\",\"occurred_at\":\"%s\"}", TEMP_ID, pendingCount, pendingSince);
  else
    snprintf(body, sizeof(body), "{\"sensor_id\":\"%s\",\"category\":\"COMMUNICATION_FAULT\",\"reason\":\"%d reading(s) could not be delivered (WiFi/HTTP failure)\"}", TEMP_ID, pendingCount);
  int code = postJson("/invalid-readings", body);
  if (code >= 200 && code < 300) pendingComm = false;
}

void sendValue(const char* id, float v) {
  char ts[25], body[200];
  if (nowIso(ts, sizeof(ts)))
    snprintf(body, sizeof(body), "{\"sensor_id\":\"%s\",\"value\":%.2f,\"timestamp\":\"%s\"}", id, v, ts);
  else
    snprintf(body, sizeof(body), "{\"sensor_id\":\"%s\",\"value\":%.2f}", id, v);
  int code = postJson("/readings", body);
  if (code >= 200 && code < 300) { flushCommFailure(); Serial.printf("%s = %.2f sent\n", id, v); }
  else { noteCommFailure(); Serial.printf("%s send failed (%d)\n", id, code); }
}

void sendReadFailure(const char* id) {         // DHT22 answered NaN: report it, never invent a value
  char ts[25], body[260];
  if (nowIso(ts, sizeof(ts)))
    snprintf(body, sizeof(body), "{\"sensor_id\":\"%s\",\"category\":\"MISSING_DATA\",\"reason\":\"DHT22 read returned NaN\",\"occurred_at\":\"%s\"}", id, ts);
  else
    snprintf(body, sizeof(body), "{\"sensor_id\":\"%s\",\"category\":\"MISSING_DATA\",\"reason\":\"DHT22 read returned NaN\"}", id);
  int code = postJson("/invalid-readings", body);
  if (!(code >= 200 && code < 300)) noteCommFailure();
}

void ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.disconnect(); WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 8000) delay(250);
}

void setup() {
  Serial.begin(115200);
  dht.begin();
  WiFi.mode(WIFI_STA);
  ensureWifi();
  configTime(0, 0, "pool.ntp.org", "time.google.com");
}

void loop() {
  if (millis() - lastRun < INTERVAL_MS) return;
  lastRun = millis();
  ensureWifi();

  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (isnan(t)) sendReadFailure(TEMP_ID); else sendValue(TEMP_ID, t);
  if (isnan(h)) sendReadFailure(HUM_ID);  else sendValue(HUM_ID, h);
}
