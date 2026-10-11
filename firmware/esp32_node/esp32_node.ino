#define RELAY_PIN 33

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);

  digitalWrite(RELAY_PIN, LOW);
  Serial.println("RELAY LOW - WAIT 5 SECONDS");
  delay(5000);

  digitalWrite(RELAY_PIN, HIGH);
  Serial.println("RELAY HIGH - WAIT 5 SECONDS");
  delay(5000);
}

void loop() {
}