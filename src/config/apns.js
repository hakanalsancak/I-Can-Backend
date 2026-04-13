const apn = require('@parse/node-apn');
const path = require('path');
const fs = require('fs');

let provider = null;

function getProvider() {
  if (provider) return provider;

  if (!process.env.APNS_KEY_ID || !process.env.APNS_TEAM_ID) {
    console.warn('APNS_KEY_ID or APNS_TEAM_ID not set — push notifications disabled');
    return null;
  }

  // Support key as base64 env var (for platforms like Render with ephemeral filesystems)
  // or as a file path
  let keyOption;
  if (process.env.APNS_KEY_BASE64) {
    keyOption = Buffer.from(process.env.APNS_KEY_BASE64, 'base64');
    console.log('APNS: using key from APNS_KEY_BASE64 env var');
  } else {
    const keyPath = process.env.APNS_KEY_PATH || './certs/AuthKey.p8';
    const resolvedKeyPath = path.resolve(keyPath);

    if (!fs.existsSync(resolvedKeyPath)) {
      console.warn(`APNS key not found at '${resolvedKeyPath}' — push notifications disabled`);
      console.warn('Set APNS_KEY_BASE64 env var with the base64-encoded .p8 key content');
      return null;
    }
    keyOption = resolvedKeyPath;
  }

  console.log(`APNS provider initializing (production=${process.env.NODE_ENV === 'production'}, keyId=${process.env.APNS_KEY_ID})`);

  provider = new apn.Provider({
    token: {
      key: keyOption,
      keyId: process.env.APNS_KEY_ID,
      teamId: process.env.APNS_TEAM_ID,
    },
    production: process.env.NODE_ENV === 'production',
  });

  return provider;
}

async function sendPush(deviceTokens, { title, body, data = {} }) {
  if (!deviceTokens || deviceTokens.length === 0) return;
  const p = getProvider();
  if (!p) return; // APNS not configured

  const notification = new apn.Notification();
  notification.expiry = Math.floor(Date.now() / 1000) + 3600;
  notification.badge = 1;
  notification.sound = 'default';
  notification.alert = { title, body };
  notification.payload = data;
  notification.topic = process.env.APNS_BUNDLE_ID || 'com.alsancar.I-Can';

  try {
    const result = await p.send(notification, deviceTokens);
    if (result.failed.length > 0) {
      console.error('APNS failed deliveries:', result.failed.map(f => f.response?.reason || f.error));
    }
    return result;
  } catch (err) {
    console.error('APNS send error:', err.message);
  }
}

module.exports = { sendPush, initProvider: getProvider };
