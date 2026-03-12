const apn = require('apn');
const path = require('path');

let provider = null;

function getProvider() {
  if (provider) return provider;

  const keyPath = process.env.APNS_KEY_PATH || './certs/AuthKey.p8';

  provider = new apn.Provider({
    token: {
      key: path.resolve(keyPath),
      keyId: process.env.APNS_KEY_ID,
      teamId: process.env.APNS_TEAM_ID,
    },
    production: process.env.NODE_ENV === 'production',
  });

  return provider;
}

async function sendPush(deviceTokens, { title, body, data = {} }) {
  if (!deviceTokens || deviceTokens.length === 0) return;

  const notification = new apn.Notification();
  notification.expiry = Math.floor(Date.now() / 1000) + 3600;
  notification.badge = 1;
  notification.sound = 'default';
  notification.alert = { title, body };
  notification.payload = data;
  notification.topic = 'com.hakanalsancak.I-Can';

  try {
    const result = await getProvider().send(notification, deviceTokens);
    if (result.failed.length > 0) {
      console.error('APNS failed deliveries:', result.failed.map(f => f.response?.reason || f.error));
    }
    return result;
  } catch (err) {
    console.error('APNS send error:', err.message);
  }
}

module.exports = { sendPush };
