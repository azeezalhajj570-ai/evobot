const axios = require('axios');
const env = require('../config/env');

const api = axios.create({
  baseURL: env.EVOLUTION_API_URL,
  headers: {
    apikey: env.EVOLUTION_API_KEY,
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

/** Build the instance name from a Telegram user ID */
function instanceName(telegramUserId) {
  return `tg_${telegramUserId}`;
}

/** Format a phone number for WhatsApp JID (e.g. 14155552671 -> 14155552671@s.whatsapp.net) */
function formatJid(phoneNumber) {
  const digits = phoneNumber.replace(/[^0-9]/g, '');
  return `${digits}@s.whatsapp.net`;
}

/** Create a new Evolution API instance and connect it */
async function createAndConnect(telegramUserId, phoneNumber) {
  const name = instanceName(telegramUserId);

  // Step 1: Create the instance
  await api.post('/instance/create', {
    instanceName: name,
    qrcode: true,
    integration: 'WHATSAPP-BAILEYS',
    number: phoneNumber,
  });

  // Step 2: Connect — v2 uses GET
  const connectRes = await api.get(`/instance/connect/${name}`);

  return parseQrResponse(connectRes.data, name);
}

/** Reconnect an existing instance (fetch a new QR code) */
async function reconnect(telegramUserId) {
  const name = instanceName(telegramUserId);

  // v2 uses GET for connect
  const connectRes = await api.get(`/instance/connect/${name}`);

  return parseQrResponse(connectRes.data, name);
}

/** Parse QR / pairing-code response from Evolution API v2 */
function parseQrResponse(data, name) {
  if (!data) {
    return { type: 'unknown', value: null, instanceName: name };
  }

  // v2 returns pairingCode directly
  if (data.pairingCode) {
    return { type: 'pairing_code', value: data.pairingCode, instanceName: name };
  }

  // v2 returns QR data in "code" field (base64-encoded QR image)
  if (data.code) {
    const base64 = data.code.replace(/^data:image\/\w+;base64,/, '');
    if (base64.length > 100) {
      return { type: 'qr', value: base64, instanceName: name };
    }
  }

  // Fallback: base64 field
  if (data.base64) {
    const base64 = data.base64.replace(/^data:image\/\w+;base64,/, '');
    return { type: 'qr', value: base64, instanceName: name };
  }

  // count=0 means QR not yet ready — caller should retry
  if (data.count !== undefined && data.count === 0) {
    return { type: 'pending', value: null, instanceName: name };
  }

  return { type: 'unknown', value: null, instanceName: name };
}

/** Fetch the connection status of an instance */
async function fetchStatus(telegramUserId) {
  const name = instanceName(telegramUserId);

  try {
    const { data } = await api.get(`/instance/fetchInstances?instanceName=${name}`);
    // v2 returns an array with objects containing connectionStatus
    if (Array.isArray(data) && data.length > 0) {
      const instance = data[0];
      return instance.connectionStatus || instance.state || instance.status || 'unknown';
    }
    return 'not_found';
  } catch (err) {
    if (err.response && err.response.status === 404) {
      return 'not_found';
    }
    throw err;
  }
}

/** Logout / disconnect an instance — v2 uses DELETE */
async function logout(telegramUserId) {
  const name = instanceName(telegramUserId);
  await api.delete(`/instance/logout/${name}`);
}

/** Permanently delete an instance */
async function deleteInstance(telegramUserId) {
  const name = instanceName(telegramUserId);

  try {
    await api.delete(`/instance/delete/${name}`);
  } catch (err) {
    if (err.response && err.response.status === 404) {
      return;
    }
    throw err;
  }
}

/**
 * Send a text message to a WhatsApp number through a connected instance.
 * v2 requires the number in JID format: phone@s.whatsapp.net
 */
async function sendTextMessage(telegramUserId, phoneNumber, text) {
  const name = instanceName(telegramUserId);
  const jid = formatJid(phoneNumber);

  await api.post(`/message/sendText/${name}`, {
    number: jid,
    text: text,
  });
}

module.exports = {
  createAndConnect,
  reconnect,
  fetchStatus,
  logout,
  deleteInstance,
  sendTextMessage,
  instanceName,
};