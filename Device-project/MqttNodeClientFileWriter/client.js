/**
 * mqtt_to_logSky.js
 * - Subscribes to MQTT
 * - Writes payload + timestamp to logSky.json (JSON Lines)
 */

const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');

// ====== CONFIG ======
const BROKER = 'mqtt://162.243.26.172:1883'; // 예: mqtt://162.xxx.xxx.xxx:1883
const TOPIC = 'temp/sky';
const FILE_PATH = path.join(__dirname, 'logSky.json');

const options = {
  clientId: 'nodeLogger-' + Date.now(),
  // username: 'sky',        // 인증 쓰면 주석 해제
  // password: 'YOUR_PASS',
  reconnectPeriod: 1000,
};

// ====== CONNECT ======
const client = mqtt.connect(BROKER, options);

client.on('connect', () => {
  console.log('MQTT connected');
  client.subscribe(TOPIC);
});

client.on('message', (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());

    const record = {
      timestamp: new Date().toISOString(),
      ...payload
    };

    fs.appendFile(
      FILE_PATH,
      JSON.stringify(record) + '\n',
      () => console.log('logged:', record)
    );

  } catch (err) {
    console.error('Invalid JSON payload:', message.toString());
  }
});

client.on('error', err => {
  console.error('MQTT error:', err.message);
});