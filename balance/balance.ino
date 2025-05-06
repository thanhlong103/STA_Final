#include <Arduino.h>
#include <Wire.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// Define I2C pins for ESP32
#define I2C_SDA 23
#define I2C_SCL 22

// Motor pins for L298N
#define ENA 16  // Enable A (Motor 1 speed)
#define IN1 17  // Motor 1 direction pin 1
#define IN2 5   // Motor 1 direction pin 2
#define IN3 19  // Motor 2 direction pin 1
#define IN4 18  // Motor 2 direction pin 2
#define ENB 21  // Enable B (Motor 2 speed)

// MPU6050 I2C Address
const int MPU6050_ADDR = 0x68;

// MPU6050 Register Addresses
const int PWR_MGMT_1   = 0x6B;
const int ACCEL_XOUT_H = 0x3B;
const int ACCEL_YOUT_H = 0x3D;
const int ACCEL_ZOUT_H = 0x3F;
const int GYRO_XOUT_H  = 0x43;
const int GYRO_YOUT_H  = 0x45;
const int GYRO_ZOUT_H  = 0x47;

// Sensor data
int16_t rawAccX, rawAccY, rawAccZ;
int16_t rawGyroX, rawGyroY, rawGyroZ;

// Sensitivity Scale Factors
const float ACCEL_SENSITIVITY = 16384.0;
const float GYRO_SENSITIVITY = 131.0;

// Processed sensor data
float accX, accY, accZ;
float gyroX, gyroY, gyroZ;
float angle;

// Complementary filter
const float ALPHA = 0.98;
float lastTime;
float dt;

// PID variables
float KP = 60.0;
float KI = 270;
float KD = 2.2;
float setpoint = 4.0;
float error, lastError;
float integral, derivative;
float pidOutput;

// Motor speed constraints
const int MAX_PWM = 255;
const int MIN_PWM = 50;

// BLE Configuration
#define SERVICE_UUID "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// BLE Server and Characteristic
BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;

// Callback for BLE connection status
class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) {
    deviceConnected = true;
    Serial.println("Device connected");
  }

  void onDisconnect(BLEServer* pServer) {
    deviceConnected = false;
    Serial.println("Device disconnected");
    // Restart advertising
    BLEDevice::startAdvertising();
  }
};

class MyCharacteristicCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
      String value = pCharacteristic->getValue().c_str();
      if (value.length() > 0) {
        Serial.print("Received PID data: "); Serial.println(value);
        int firstComma = value.indexOf(',');
        int secondComma = value.indexOf(',', firstComma + 1);
        
        if (firstComma != -1 && secondComma != -1) {
          float newKP = value.substring(0, firstComma).toFloat();
          float newKI = value.substring(firstComma + 1, secondComma).toFloat();
          float newKD = value.substring(secondComma + 1).toFloat();
          
          // Apply bounds checking
          KP = constrain(newKP, 0.0, 3000.0);
          KI = constrain(newKI, 0.0, 3000.0);
          KD = constrain(newKD, 0.0, 3000.0);
          
          // Reset PID terms
          error = 0;
          lastError = 0;
          integral = 0;
          
          Serial.print("New PID Gains - KP: "); Serial.print(KP);
          Serial.print(", KI: "); Serial.print(KI);
          Serial.print(", KD: "); Serial.println(KD);
        } else {
          Serial.println("Invalid PID data format");
        }
      }
    }
};

void setup() {
  Serial.begin(115200);

  // Initialize motor pins
  pinMode(ENA, OUTPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);
  pinMode(ENB, OUTPUT);
  
  stopMotors();

  while (!Serial) {
    delay(10);
  }
  Serial.println("ESP32 Self-Balancing Robot");

  // Initialize I2C
  Serial.println("Initializing I2C...");
  if (!Wire.begin(I2C_SDA, I2C_SCL)) {
    Serial.println("Failed to initialize I2C communication.");
  }
  Serial.println("I2C Initialized.");

  // Wake up MPU6050
  Serial.println("Waking up MPU6050...");
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(PWR_MGMT_1);
  Wire.write(0x00);
  if (Wire.endTransmission(true) != 0) {
    Serial.println("MPU6050 Wake Up failed.");
  }
  Serial.println("MPU6050 Wake Up successful.");

  // Initialize BLE
  BLEDevice::init("SelfBalancingRobot");
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  
  BLEService *pService = pServer->createService(SERVICE_UUID);
  
  pCharacteristic = pService->createCharacteristic(
                     CHARACTERISTIC_UUID,
                     BLECharacteristic::PROPERTY_READ   |
                     BLECharacteristic::PROPERTY_WRITE  |
                     BLECharacteristic::PROPERTY_NOTIFY |
                     BLECharacteristic::PROPERTY_INDICATE
                   );
                   
  pCharacteristic->addDescriptor(new BLE2902());
  pCharacteristic->setCallbacks(new MyCharacteristicCallbacks());
  pService->start();
  
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  BLEDevice::startAdvertising();
  Serial.println("BLE Advertising started");

  lastTime = micros() / 1000000.0;
}

void controlMotor1(int speed, bool forward) {
  if (speed == 0) {
    digitalWrite(IN1, LOW);
    digitalWrite(IN2, LOW);
    analogWrite(ENA, 0);
    return;
  }
  if (forward) {
    digitalWrite(IN1, HIGH);
    digitalWrite(IN2, LOW);
  } else {
    digitalWrite(IN1, LOW);
    digitalWrite(IN2, HIGH);
  }
  analogWrite(ENA, constrain(speed, 0, MAX_PWM));
}

void controlMotor2(int speed, bool forward) {
  if (speed == 0) {
    digitalWrite(IN3, LOW);
    digitalWrite(IN4, LOW);
    analogWrite(ENB, 0);
    return;
  }
  if (forward) {
    digitalWrite(IN3, HIGH);
    digitalWrite(IN4, LOW);
  } else {
    digitalWrite(IN3, LOW);
    digitalWrite(IN4, HIGH);
  }
  analogWrite(ENB, constrain(speed, 0, MAX_PWM));
}

void stopMotors() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, LOW);
  analogWrite(ENA, 0);
  analogWrite(ENB, 0);
}

bool readMPU6050() {
  // Read accelerometer data
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(ACCEL_XOUT_H);
  Wire.endTransmission(false);
  if (Wire.requestFrom(MPU6050_ADDR, 6, true) != 6) {
    Serial.println("Failed to read Accel data");
    return false;
  }
  rawAccX = (Wire.read() << 8) | Wire.read();
  rawAccY = (Wire.read() << 8) | Wire.read();
  rawAccZ = (Wire.read() << 8) | Wire.read();

  // Read gyroscope data
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(GYRO_XOUT_H);
  Wire.endTransmission(false);
  if (Wire.requestFrom(MPU6050_ADDR, 6, true) != 6) {
    Serial.println("Failed to read Gyro data");
    return false;
  }
  rawGyroX = (Wire.read() << 8) | Wire.read();
  rawGyroY = (Wire.read() << 8) | Wire.read();
  rawGyroZ = (Wire.read() << 8) | Wire.read();

  accX = rawAccX / ACCEL_SENSITIVITY;
  accY = rawAccY / ACCEL_SENSITIVITY;
  accZ = rawAccZ / ACCEL_SENSITIVITY;
  gyroX = rawGyroX / GYRO_SENSITIVITY;
  gyroY = rawGyroY / GYRO_SENSITIVITY;
  gyroZ = rawGyroZ / GYRO_SENSITIVITY;
  return true;
}

void calculateAngle() {
  float currentTime = micros() / 1000000.0;
  dt = currentTime - lastTime;
  lastTime = currentTime;

  float accAngle = atan2(accY, accZ) * 180.0 / PI;
  static float gyroAngle = 0.0;
  gyroAngle += gyroX * dt;
  angle = ALPHA * (angle + gyroX * dt) + (1.0 - ALPHA) * accAngle;
}

void loop() {
  if (!deviceConnected) {
    delay(500); // Wait for connection
    return;
  }
  
  if (!readMPU6050()) {
    stopMotors();
    delay(100);
    return;
  }

  calculateAngle();

  error = - setpoint + angle;
  integral += error * dt;
  derivative = (error - lastError) / dt;
  pidOutput = KP * error + KI * integral + KD * derivative;
  lastError = error;

  int motorSpeed = abs(pidOutput);
  motorSpeed = constrain(motorSpeed, 0, MAX_PWM);
  if (motorSpeed < MIN_PWM && motorSpeed > 0) {
    motorSpeed = MIN_PWM;
  }

  bool forward = pidOutput >= 0;
  controlMotor1(motorSpeed, forward);
  controlMotor2(motorSpeed, forward);

  // Send data over BLE if connected
  if (deviceConnected) {
    String data = String(KP) + "," + String(KI) + "," + String(KD) + "," +
                  String(accX, 2) + "," + String(accY, 2) + "," + String(accZ, 2) + "," +
                  String(gyroX, 2) + "," + String(gyroY, 2) + "," + String(gyroZ, 2) + "," +
                  String(angle, 2) + "," + String(motorSpeed);
    pCharacteristic->setValue(data.c_str());
    pCharacteristic->notify();
  }

  Serial.print("Angle: "); Serial.print(angle, 2);
  Serial.print(" | Error: "); Serial.print(error, 2);
  Serial.print(" | PID: "); Serial.print(pidOutput, 2);
  Serial.print(" | Speed: "); Serial.print(motorSpeed);
  Serial.print(" | Dir: "); Serial.println(forward ? "FWD" : "REV");

  delay(10);
}