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

  // Step 2: Connect the instance and request QR/pairing code
  const connectRes = await api.post(`/instance/connect/${name}`);

  return parseQrResponse(connectRes.data, name);
}

/** Reconnect an existing instance (fetch a new QR code) */
async function reconnect(telegramUserId) {
  const name = instanceName(telegramUserId);

  const connectRes = await api.post(`/instance/connect/${name}`);

  return parseQrResponse(connectRes.data, name);
}

/** Parse QR / pairing-code response from Evolution API */
function parseQrResponse(data, name) {
  if (data && data.pairingCode) {
    return { type: 'pairing_code', value: data.pairingCode, instanceName: name };
  }

  if (data && data.base64) {
    const base64 = data.base64.replace(/^data:image\/\w+;base64,/, '');
    return { type: 'qr', value: base64, instanceName: name };
  }

  if (data && data.code) {
    const base64 = data.code.replace(/^data:image\/\w+;base64,/, '');
    return { type: 'qr', value: base64, instanceName: name };
  }

  return { type: 'unknown', value: null, instanceName: name };
}

/** Fetch the connection status of an instance */
async function fetchStatus(telegramUserId) {
  const name = instanceName(telegramUserId);

  try {
    const { data } = await api.get(`/instance/fetchInstances?instanceName=${name}`);
    if (Array.isArray(data) && data.length > 0) {
      const instance = data[0];
      return instance.state || instance.status || 'unknown';
    }
    if (data && data.state) {
      return data.state;
    }
    return 'not_found';
  } catch (err) {
    if (err.response && err.response.status === 404) {
      return 'not_found';
    }
    throw err;
  }
}

/** Logout / disconnect an instance (keeps it alive for later reconnect) */
async function logout(telegramUserId) {
  const name = instanceName(telegramUserId);
  await api.post(`/instance/logout/${name}`);
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
 * The instance must be in "open" / connected state.
 */
async function sendTextMessage(telegramUserId, phoneNumber, text) {
  const name = instanceName(telegramUserId);

  await api.post(`/message/sendText/${name}`, {
    number: phoneNumber,
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