#include <Arduino.h>
#include <Wire.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// I2C Pins for ESP32
#define I2C_SDA 23
#define I2C_SCL 22

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

// Sensitivity Scale Factors
const float ACCEL_SENSITIVITY = 16384.0; // ±2g range -> 16384 LSB/g
const float GYRO_SENSITIVITY = 131.0;    // ±250 °/s range -> 131 LSB/(°/s)

// BLE UUIDs (matching the web app)
#define SERVICE_UUID "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// BLE Server and Characteristic
BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;

// Variables for raw sensor data
int16_t rawAccX, rawAccY, rawAccZ;
int16_t rawGyroX, rawGyroY, rawGyroZ;

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

void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);
  Serial.println("ESP32 BLE MPU6050 Start");

  // Initialize I2C
  Serial.println("Initializing I2C...");
  if (!Wire.begin(I2C_SDA, I2C_SCL)) {
    Serial.println("Failed to initialize I2C.");
    // while (1) delay(10);
  }

  // Wake up MPU6050
  Serial.println("Waking up MPU6050...");
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(PWR_MGMT_1);
  Wire.write(0x00); // Disable sleep mode
  if (Wire.endTransmission(true) != 0) {
    Serial.println("MPU6050 Wake Up failed.");
    // while (1) delay(10);
  }
  Serial.println("MPU6050 Initialized");

  // Initialize BLE
  Serial.println("Initializing BLE...");
  BLEDevice::init("MotorControl"); // Device name matches web app filter
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  // Create BLE Service
  BLEService* pService = pServer->createService(SERVICE_UUID);

  // Create BLE Characteristic
  pCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ |
    BLECharacteristic::PROPERTY_WRITE |
    BLECharacteristic::PROPERTY_NOTIFY
  );
  pCharacteristic->addDescriptor(new BLE2902()); // Enable notifications

  // Start the service
  pService->start();

  // Start advertising
  BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06); // Helps with iPhone connectivity
  BLEDevice::startAdvertising();
  Serial.println("BLE Advertising started");
}

void loop() {
  if (!deviceConnected) {
    delay(500); // Wait for connection
    return;
  }

  // Read Accelerometer Data
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(ACCEL_XOUT_H);
  Wire.endTransmission(false);
  if (Wire.requestFrom(MPU6050_ADDR, 6, true) == 6) {
    rawAccX = (Wire.read() << 8) | Wire.read();
    rawAccY = (Wire.read() << 8) | Wire.read();
    rawAccZ = (Wire.read() << 8) | Wire.read();
  } else {
    Serial.println("Failed to read Accel data");
    rawAccX = rawAccY = rawAccZ = 0;
  }

  // Read Gyroscope Data
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(GYRO_XOUT_H);
  Wire.endTransmission(false);
  if (Wire.requestFrom(MPU6050_ADDR, 6, true) == 6) {
    rawGyroX = (Wire.read() << 8) | Wire.read();
    rawGyroY = (Wire.read() << 8) | Wire.read();
    rawGyroZ = (Wire.read() << 8) | Wire.read();
  } else {
    Serial.println("Failed to read Gyro data");
    rawGyroX = rawGyroY = rawGyroZ = 0;
  }

  // Convert to scaled values and prepare for BLE
  // Web app expects values scaled by 100 (e.g., g * 100, °/s * 100)
  uint16_t ax = (uint16_t)((rawAccX / ACCEL_SENSITIVITY) * 100);
  uint16_t ay = (uint16_t)((rawAccY / ACCEL_SENSITIVITY) * 100);
  uint16_t az = (uint16_t)((rawAccZ / ACCEL_SENSITIVITY) * 100);
  uint16_t gx = (uint16_t)((rawGyroX / GYRO_SENSITIVITY) * 100);
  uint16_t gy = (uint16_t)((rawGyroY / GYRO_SENSITIVITY) * 100);
  uint16_t gz = (uint16_t)((rawGyroZ / GYRO_SENSITIVITY) * 100);

  // Prepare BLE data packet (matches web app format: type 0x02 + 12 bytes)
  uint8_t data[13];
  data[0] = 0x02; // Type identifier for IMU data
  // High and low bytes for each value
  data[1] = (ax >> 8) & 0xFF; data[2] = ax & 0xFF;
  data[3] = (ay >> 8) & 0xFF; data[4] = ay & 0xFF;
  data[5] = (az >> 8) & 0xFF; data[6] = az & 0xFF;
  data[7] = (gx >> 8) & 0xFF; data[8] = gx & 0xFF;
  data[9] = (gy >> 8) & 0xFF; data[10] = gy & 0xFF;
  data[11] = (gz >> 8) & 0xFF; data[12] = gz & 0xFF;

  // Send data via BLE notification
  pCharacteristic->setValue(data, 13);
  pCharacteristic->notify();
  Serial.println("Sent IMU data via BLE");

  // Print data for debugging
  Serial.print("Acc (g*100): X="); Serial.print(ax / 100.0, 2);
  Serial.print(" Y="); Serial.print(ay / 100.0, 2);
  Serial.print(" Z="); Serial.println(az / 100.0, 2);
  Serial.print("Gyro (°/s*100): X="); Serial.print(gx / 100.0, 2);
  Serial.print(" Y="); Serial.print(gy / 100.0, 2);
  Serial.print(" Z="); Serial.println(gz / 100.0, 2);

  delay(100); // Adjust delay to control data rate (10Hz update rate)
}