// Pin definitions for L298N motor driver
#define ENA 16  // Enable A (Motor 1 speed)
#define IN1 17  // Motor 1 direction pin 1
#define IN2 5   // Motor 1 direction pin 2
#define IN3 19  // Motor 2 direction pin 1
#define IN4 18  // Motor 2 direction pin 2
#define ENB 21  // Enable B (Motor 2 speed)

void setup() {
  // Set motor control pins as outputs
  pinMode(ENA, OUTPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);
  pinMode(ENB, OUTPUT);

  // Initialize serial communication for debugging
  Serial.begin(115200);
}

// Function to control Motor 1 (forward, backward, stop)
void controlMotor1(int speed, bool forward) {
  // Set direction
  if (forward) {
    digitalWrite(IN1, HIGH);
    digitalWrite(IN2, LOW);
  } else {
    digitalWrite(IN1, LOW);
    digitalWrite(IN2, HIGH);
  }
  // Set speed (0-255)
  analogWrite(ENA, speed);
}

// Function to control Motor 2 (forward, backward, stop)
void controlMotor2(int speed, bool forward) {
  // Set direction
  if (forward) {
    digitalWrite(IN3, HIGH);
    digitalWrite(IN4, LOW);
  } else {
    digitalWrite(IN3, LOW);
    digitalWrite(IN4, HIGH);
  }
  // Set speed (0-255)
  analogWrite(ENB, speed);
}

// Function to stop both motors
void stopMotors() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, LOW);
  analogWrite(ENA, 0);
  analogWrite(ENB, 0);
}

void loop() {
  // Example: Move both motors forward at half speed
  Serial.println("Moving both motors forward...");
  controlMotor1(128, true);  // Motor 1 forward at 50% speed
  controlMotor2(128, true);  // Motor 2 forward at 50% speed
  delay(2000);

  // Stop both motors
  Serial.println("Stopping motors...");
  stopMotors();
  delay(1000);

  // Move both motors backward at full speed
  Serial.println("Moving both motors backward...");
  controlMotor1(255, false);  // Motor 1 backward at full speed
  controlMotor2(255, false);  // Motor 2 backward at full speed
  delay(2000);

  // Stop both motors
  Serial.println("Stopping motors...");
  stopMotors();
  delay(1000);
}