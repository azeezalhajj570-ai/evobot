const { Telegraf, Markup } = require('telegraf');
const env = require('../config/env');
const userService = require('../services/users');
const evolutionService = require('../services/evolution');
const { mainMenu, confirmDelete, confirmDisconnect } = require('../keyboards/menu');

const bot = new Telegraf(env.BOT_TOKEN);

// Track which users are in the "waiting for phone number" flow
const awaitingPhone = new Set();

// ─── /start ────────────────────────────────────────────────────────────────────
bot.start(async (ctx) => {
  const telegramUserId = ctx.from.id;
  const user = await userService.findByTelegramId(telegramUserId);

  let text = '👋 *Welcome to EvoBot!*\n\nLink your WhatsApp account using Evolution API.';

  if (user) {
    const statusLabel = statusEmoji(user.connection_status);
    text += `\n\nYou already have an instance (*${user.instance_name}*).\nStatus: ${statusLabel} \`${user.connection_status}\``;
  }

  await ctx.replyWithMarkdownV2(escapeMd(text), mainMenu());
});

// ─── CONNECT ──────────────────────────────────────────────────────────────────
bot.action('action_connect', async (ctx) => {
  const telegramUserId = ctx.from.id;

  // Ask the user for their WhatsApp phone number
  awaitingPhone.add(telegramUserId);

  await ctx.reply(
    '📱 Please send your WhatsApp phone number with country code.\n\n' +
    'Example: `+14155552671` or `14155552671` (US number)',
    { parse_mode: 'Markdown' }
  );
});

// Handle phone number text input (only from users in the awaiting flow)
bot.on('text', async (ctx) => {
  const telegramUserId = ctx.from.id;

  if (!awaitingPhone.has(telegramUserId)) return;

  // Remove from awaiting set — one shot
  awaitingPhone.delete(telegramUserId);

  const rawPhone = ctx.message.text.trim();
  const cleanPhone = cleanPhoneNumber(rawPhone);

  if (!cleanPhone || cleanPhone.length < 10) {
    await ctx.reply(
      '❌ That doesn\'t look like a valid phone number. Please click *Connect* again and send a number with country code.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  await ctx.reply('⏳ Creating your WhatsApp instance...');

  try {
    // Upsert user record first
    const instanceName = evolutionService.instanceName(telegramUserId);
    let user = await userService.findByTelegramId(telegramUserId);

    if (user) {
      await userService.updatePhoneNumber(telegramUserId, cleanPhone);
    } else {
      user = await userService.createUser({
        telegramUserId,
        phoneNumber: cleanPhone,
        instanceName,
      });
    }

    // Create instance on Evolution API
    const result = await evolutionService.createAndConnect(telegramUserId, cleanPhone);

    await userService.updateStatus(telegramUserId, 'pending_qr');

    if (result.type === 'pairing_code') {
      await ctx.reply(
        `✅ Instance created!\n\n🔑 *Pairing Code:* \`${result.value}\`\n\nEnter this code in WhatsApp → Linked Devices → Link with phone number.`,
        { parse_mode: 'Markdown' }
      );
    } else if (result.type === 'qr') {
      const buffer = Buffer.from(result.value, 'base64');
      await ctx.replyWithPhoto(
        { source: buffer },
        { caption: '✅ Instance created!\n\nScan this QR code in WhatsApp → Linked Devices.' }
      );
    } else {
      await ctx.reply(
        '⚠️ Instance created but no QR code or pairing code was returned. Try *Reconnect* to get a new code.',
        { parse_mode: 'Markdown' }
      );
    }

    await ctx.reply('What would you like to do next?', mainMenu());
  } catch (err) {
    console.error('Connect error:', err.message);
    await ctx.reply(
      `❌ Failed to create instance: ${escapeHtml(err.message)}\n\nPlease try again.`,
      mainMenu()
    );
  }
});

// ─── RECONNECT ────────────────────────────────────────────────────────────────
bot.action('action_reconnect', async (ctx) => {
  const telegramUserId = ctx.from.id;
  const user = await userService.findByTelegramId(telegramUserId);

  if (!user) {
    await ctx.reply('⚠️ You don\'t have an instance yet. Click *Connect* first.', mainMenu());
    return;
  }

  await ctx.reply('⏳ Reconnecting your instance...');

  try {
    const result = await evolutionService.reconnect(telegramUserId);

    await userService.updateStatus(telegramUserId, 'pending_qr');

    if (result.type === 'pairing_code') {
      await ctx.reply(
        `🔑 *New Pairing Code:* \`${result.value}\`\n\nEnter this in WhatsApp → Linked Devices.`,
        { parse_mode: 'Markdown' }
      );
    } else if (result.type === 'qr') {
      const buffer = Buffer.from(result.value, 'base64');
      await ctx.replyWithPhoto(
        { source: buffer },
        { caption: 'Scan this new QR code in WhatsApp → Linked Devices.' }
      );
    } else {
      await ctx.reply('⚠️ No QR code or pairing code returned. Your instance may already be connected.');
    }

    await ctx.reply('What would you like to do next?', mainMenu());
  } catch (err) {
    console.error('Reconnect error:', err.message);
    await ctx.reply(`❌ Reconnect failed: ${escapeHtml(err.message)}`, mainMenu());
  }
});

// ─── DISCONNECT (confirm first) ──────────────────────────────────────────────
bot.action('action_disconnect', async (ctx) => {
  const user = await userService.findByTelegramId(ctx.from.id);

  if (!user) {
    await ctx.reply('⚠️ You don\'t have an instance yet. Click *Connect* first.', mainMenu());
    return;
  }

  await ctx.reply(
    '🔌 Are you sure you want to disconnect? You can always reconnect later.',
    confirmDisconnect()
  );
});

bot.action('action_disconnect_confirm', async (ctx) => {
  const telegramUserId = ctx.from.id;

  await ctx.reply('⏳ Disconnecting...');

  try {
    await evolutionService.logout(telegramUserId);
    await userService.updateStatus(telegramUserId, 'disconnected');
    await ctx.reply('✅ Disconnected. Click *Reconnect* whenever you want to link again.', mainMenu());
  } catch (err) {
    console.error('Disconnect error:', err.message);
    await ctx.reply(`❌ Disconnect failed: ${escapeHtml(err.message)}`, mainMenu());
  }
});

// ─── DELETE (confirm first) ──────────────────────────────────────────────────
bot.action('action_delete', async (ctx) => {
  const user = await userService.findByTelegramId(ctx.from.id);

  if (!user) {
    await ctx.reply('⚠️ You don\'t have an instance to delete.', mainMenu());
    return;
  }

  await ctx.reply(
    '🗑️ *This will permanently delete your WhatsApp instance and all associated data.*\n\nAre you sure?',
    { parse_mode: 'Markdown', ...confirmDelete() }
  );
});

bot.action('action_delete_confirm', async (ctx) => {
  const telegramUserId = ctx.from.id;

  await ctx.reply('⏳ Deleting instance...');

  try {
    await evolutionService.deleteInstance(telegramUserId);
    await userService.deleteUser(telegramUserId);
    await ctx.reply('✅ Instance deleted. All data removed.', mainMenu());
  } catch (err) {
    console.error('Delete error:', err.message);
    await ctx.reply(`❌ Delete failed: ${escapeHtml(err.message)}`, mainMenu());
  }
});

// ─── STATUS ──────────────────────────────────────────────────────────────────
bot.action('action_status', async (ctx) => {
  const telegramUserId = ctx.from.id;
  const user = await userService.findByTelegramId(telegramUserId);

  if (!user) {
    await ctx.reply('ℹ️ You don\'t have an instance yet. Click *Connect* to get started.', mainMenu());
    return;
  }

  await ctx.reply('⏳ Checking status...');

  try {
    const remoteStatus = await evolutionService.fetchStatus(telegramUserId);

    // Update our local record
    if (remoteStatus !== 'not_found') {
      await userService.updateStatus(telegramUserId, remoteStatus);
    }

    const label = statusEmoji(remoteStatus);
    await ctx.reply(
      `📊 *Instance:* \`${user.instance_name}\`\n📱 *Phone:* \`${user.phone_number || 'N/A'}\`\n${label} *Status:* \`${remoteStatus}\``,
      { parse_mode: 'Markdown' }
    );
    await ctx.reply('What would you like to do next?', mainMenu());
  } catch (err) {
    console.error('Status error:', err.message);
    await ctx.reply(`❌ Could not fetch status: ${escapeHtml(err.message)}`, mainMenu());
  }
});

// ─── CANCEL ──────────────────────────────────────────────────────────────────
bot.action('action_cancel', async (ctx) => {
  awaitingPhone.delete(ctx.from.id);
  await ctx.reply('↩️ Cancelled.', mainMenu());
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Strip non-digits and leading zeros from a phone number */
function cleanPhoneNumber(raw) {
  let digits = raw.replace(/[^0-9]/g, '');
  // Remove a single leading 0 after country code (common in some locales)
  if (digits.length > 11 && digits.startsWith('0', digits.length - 10)) {
    digits = digits.slice(0, -10) + digits.slice(-10);
  }
  return digits;
}

/** Map connection status to an emoji indicator */
function statusEmoji(status) {
  const map = {
    open: '🟢',
    connected: '🟢',
    pairing: '🟡',
    pending_qr: '🟡',
    disconnected: '🔴',
    close: '🔴',
    not_found: '⚪️',
  };
  return map[status] || '⚪️';
}

/** Escape special characters for MarkdownV2 */
function escapeMd(text) {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

/** Escape special characters for HTML */
function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = bot;