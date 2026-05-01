const { Telegraf, Markup } = require('telegraf');
const env = require('../config/env');
const userService = require('../services/users');
const evolutionService = require('../services/evolution');
const otpService = require('../services/otp');
const { requireVerifiedUser } = require('../middleware/auth');
const { verifiedMenu, unverifiedMenu, confirmDelete, confirmDisconnect } = require('../keyboards/menu');

const bot = new Telegraf(env.BOT_TOKEN);

// Track which users are in the "waiting for phone number" or "waiting for OTP" flow
const awaitingPhone = new Set();
const awaitingOtp = new Set();

// ─── HELPERS ────────────────────────────────────────────────────────────────

/** Strip non-digits and leading zeros from a phone number */
function cleanPhoneNumber(raw) {
  let digits = raw.replace(/[^0-9]/g, '');
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

/** Select the right menu based on verification status */
async function menuForUser(telegramUserId) {
  const user = await userService.findByTelegramId(telegramUserId);
  if (user && user.is_verified) {
    return verifiedMenu();
  }
  return unverifiedMenu();
}

/** Escape special characters for MarkdownV2 */
function escapeMd(text) {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

/** Escape special characters for HTML */
function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── /start ──────────────────────────────────────────────────────────────────

bot.start(async (ctx) => {
  const telegramUserId = ctx.from.id;
  const user = await userService.findByTelegramId(telegramUserId);

  let text = '👋 *Welcome to EvoBot\\!*';
  text += '\nLink your WhatsApp account using Evolution API\\.';

  if (user && user.is_verified) {
    const label = statusEmoji(user.connection_status);
    text += `\n\n✅ Verified — *${escapeMd(user.instance_name)}*`;
    text += `\n${label} Status: \`${escapeMd(user.connection_status)}\``;
    await ctx.replyWithMarkdownV2(text, verifiedMenu());
  } else if (user) {
    text += '\n\n🔐 Your WhatsApp number is *not yet verified*\\.';
    text += '\nClick *Verify OTP* to complete setup\\.';
    await ctx.replyWithMarkdownV2(text, unverifiedMenu());
  } else {
    text += '\n\nClick *Connect* to get started\\.';
    await ctx.replyWithMarkdownV2(text, unverifiedMenu());
  }
});

// ─── CONNECT ─────────────────────────────────────────────────────────────────

bot.action('action_connect', async (ctx) => {
  awaitingPhone.add(ctx.from.id);

  await ctx.reply(
    '📱 Please send your WhatsApp phone number with country code.\n\n' +
    'Example: `+14155552671` or `14155552671`',
    { parse_mode: 'Markdown' }
  );
});

bot.on('text', async (ctx) => {
  const telegramUserId = ctx.from.id;

  // ── OTP input flow ────────────────────────────────────────────────────
  if (awaitingOtp.has(telegramUserId)) {
    awaitingOtp.delete(telegramUserId);

    const inputCode = ctx.message.text.trim();

    if (!/^\d{6}$/.test(inputCode)) {
      awaitingOtp.add(telegramUserId);
      await ctx.reply('❌ Please enter a valid 6‑digit code.', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('❌ Cancel', 'action_cancel')],
        ]),
      });
      return;
    }

    const user = await userService.findByTelegramId(telegramUserId);
    if (!user) {
      await ctx.reply('⚠️ User not found. Click *Connect* to start over.', unverifiedMenu());
      return;
    }

    // Check lockout
    if (otpService.isOtpLocked(user)) {
      const lockedUntil = new Date(user.otp_locked_until);
      await ctx.reply(
        `🔒 Too many failed attempts. Verification is locked until *${lockedUntil.toLocaleTimeString()}*.\n\nTry *Resend OTP* later.`,
        { parse_mode: 'Markdown', ...unverifiedMenu() }
      );
      return;
    }

    // Check expiry
    if (otpService.isOtpExpired(user)) {
      await ctx.reply(
        '⏰ Your OTP has expired. Click *Resend OTP* to get a new one.',
        { parse_mode: 'Markdown', ...unverifiedMenu() }
      );
      return;
    }

    // Verify the OTP hash
    const isValid = otpService.verifyOtp(inputCode, user.otp_hash);

    if (!isValid) {
      const attempts = await userService.incrementOtpAttempts(telegramUserId);

      if (attempts >= env.OTP_MAX_ATTEMPTS) {
        const lockedUntil = otpService.lockoutUntil();
        await userService.lockOtp(telegramUserId, lockedUntil);
        await ctx.reply(
          `🔒 Too many failed attempts. Verification locked for *${env.OTP_LOCKOUT_MINUTES} minutes*.`,
          { parse_mode: 'Markdown', ...unverifiedMenu() }
        );
        return;
      }

      const remaining = env.OTP_MAX_ATTEMPTS - attempts;
      awaitingOtp.add(telegramUserId);
      await ctx.reply(
        `❌ Incorrect code. *${remaining}* attempt(s) remaining.`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('❌ Cancel', 'action_cancel')],
          ]),
        }
      );
      return;
    }

    // OTP is valid — mark verified
    await userService.verifyUser(telegramUserId);
    await ctx.reply(
      '✅ *WhatsApp number verified\\!* You now have full access\\.',
      { parse_mode: 'MarkdownV2', ...verifiedMenu() }
    );
    return;
  }

  // ── Phone number input flow ──────────────────────────────────────────
  if (!awaitingPhone.has(telegramUserId)) return;

  awaitingPhone.delete(telegramUserId);

  const rawPhone = ctx.message.text.trim();
  const cleanPhone = cleanPhoneNumber(rawPhone);

  if (!cleanPhone || cleanPhone.length < 10) {
    await ctx.reply(
      '❌ That doesn\'t look like a valid phone number. Click *Connect* again.',
      { parse_mode: 'Markdown', ...unverifiedMenu() }
    );
    return;
  }

  await ctx.reply('⏳ Creating your WhatsApp instance...');

  try {
    const instanceName = evolutionService.instanceName(telegramUserId);
    let user = await userService.findByTelegramId(telegramUserId);

    const phoneChanged = user && user.phone_number !== cleanPhone;

    if (user) {
      await userService.updatePhoneNumber(telegramUserId, cleanPhone);
      // Phone changed → require re-verification
      if (phoneChanged) {
        await userService.resetVerification(telegramUserId);
      }
    } else {
      user = await userService.createUser({
        telegramUserId,
        phoneNumber: cleanPhone,
        instanceName,
      });
    }

    const result = await evolutionService.createAndConnect(telegramUserId, cleanPhone);
    await userService.updateStatus(telegramUserId, 'pending_qr');

    if (result.type === 'pairing_code') {
      await ctx.reply(
        `✅ Instance created\\!\n\n🔑 *Pairing Code:* \`${escapeMd(result.value)}\`\n\nEnter this code in WhatsApp → Linked Devices → Link with phone number\\.`,
        { parse_mode: 'MarkdownV2' }
      );
    } else if (result.type === 'qr') {
      const buffer = Buffer.from(result.value, 'base64');
      await ctx.replyWithPhoto(
        { source: buffer },
        { caption: '✅ Instance created!\n\nScan this QR code in WhatsApp → Linked Devices.' }
      );
    } else {
      await ctx.reply(
        '⚠️ Instance created but no QR or pairing code returned. Try *Reconnect*.',
        { parse_mode: 'Markdown' }
      );
    }

    await ctx.reply(
      '🔐 *Next step:* verify your WhatsApp number\\.\n\nAfter scanning the QR / entering the pairing code, click *Verify OTP* below to receive a verification code on your WhatsApp\\.',
      { parse_mode: 'MarkdownV2', ...unverifiedMenu() }
    );
  } catch (err) {
    console.error('Connect error:', err.message);
    await ctx.reply(
      `❌ Failed to create instance: ${escapeHtml(err.message)}\n\nPlease try again.`,
      unverifiedMenu()
    );
  }
});

// ─── VERIFY OTP ──────────────────────────────────────────────────────────────

bot.action('action_verify_otp', async (ctx) => {
  const telegramUserId = ctx.from.id;
  const user = await userService.findByTelegramId(telegramUserId);

  if (!user) {
    await ctx.reply('⚠️ You don\'t have an instance yet. Click *Connect* first.', unverifiedMenu());
    return;
  }

  if (user.is_verified) {
    await ctx.reply('✅ You\'re already verified!', verifiedMenu());
    return;
  }

  // Check lockout
  if (otpService.isOtpLocked(user)) {
    const lockedUntil = new Date(user.otp_locked_until);
    await ctx.reply(
      `🔒 Too many failed attempts. Verification is locked until *${lockedUntil.toLocaleTimeString()}*.\n\nTry *Resend OTP* later.`,
      { parse_mode: 'Markdown', ...unverifiedMenu() }
    );
    return;
  }

  // Check that the instance is connected on Evolution API before sending OTP
  let remoteStatus;
  try {
    remoteStatus = await evolutionService.fetchStatus(telegramUserId);
  } catch (err) {
    console.error('Status check before OTP:', err.message);
    await ctx.reply('❌ Could not check WhatsApp connection. Please try again.', unverifiedMenu());
    return;
  }

  if (remoteStatus !== 'open' && remoteStatus !== 'connected') {
    await ctx.reply(
      `⚠️ Your WhatsApp instance is not connected yet (status: *${remoteStatus}*).\n\nPlease scan the QR code or enter the pairing code first, then click *Verify OTP* again.`,
      { parse_mode: 'Markdown', ...unverifiedMenu() }
    );
    return;
  }

  // Generate and send OTP
  const otp = otpService.generateOtp();
  const hash = otpService.hashOtp(otp);
  const expiresAt = otpService.otpExpiresAt();

  await userService.setOtp(telegramUserId, hash, expiresAt);

  try {
    await evolutionService.sendTextMessage(
      telegramUserId,
      user.phone_number,
      `Your EvoBot verification code is: ${otp}\n\nThis code expires in ${env.OTP_EXPIRY_MINUTES} minutes.\nDo not share this code with anyone.`
    );
  } catch (err) {
    console.error('OTP send error:', err.message);
    await ctx.reply(
      '❌ Could not send OTP to your WhatsApp. Make sure your number is connected and try *Resend OTP*.',
      { parse_mode: 'Markdown', ...unverifiedMenu() }
    );
    return;
  }

  // Never include the OTP in the Telegram message
  awaitingOtp.add(telegramUserId);

  await ctx.reply(
    `📧 A 6‑digit verification code has been sent to your WhatsApp number *${user.phone_number}*\\.\n\nPlease enter the code below\\.\\.\\.`,
    {
      parse_mode: 'MarkdownV2',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('❌ Cancel', 'action_cancel')],
      ]),
    }
  );
});

// ─── RESEND OTP ──────────────────────────────────────────────────────────────

bot.action('action_resend_otp', async (ctx) => {
  const telegramUserId = ctx.from.id;
  const user = await userService.findByTelegramId(telegramUserId);

  if (!user) {
    await ctx.reply('⚠️ You don\'t have an instance yet. Click *Connect* first.', unverifiedMenu());
    return;
  }

  if (user.is_verified) {
    await ctx.reply('✅ You\'re already verified!', verifiedMenu());
    return;
  }

  // Check lockout
  if (otpService.isOtpLocked(user)) {
    const lockedUntil = new Date(user.otp_locked_until);
    await ctx.reply(
      `🔒 Too many failed attempts. Verification is locked until *${lockedUntil.toLocaleTimeString()}*.\n\nPlease wait before requesting a new code.`,
      { parse_mode: 'Markdown', ...unverifiedMenu() }
    );
    return;
  }

  // Check WhatsApp is connected
  let remoteStatus;
  try {
    remoteStatus = await evolutionService.fetchStatus(telegramUserId);
  } catch (err) {
    console.error('Status check before resend:', err.message);
    await ctx.reply('❌ Could not check WhatsApp connection. Please try again.', unverifiedMenu());
    return;
  }

  if (remoteStatus !== 'open' && remoteStatus !== 'connected') {
    await ctx.reply(
      `⚠️ Your WhatsApp instance is not connected (status: *${remoteStatus}*).\n\nScan the QR code or enter the pairing code first.`,
      { parse_mode: 'Markdown', ...unverifiedMenu() }
    );
    return;
  }

  // Generate a new OTP
  const otp = otpService.generateOtp();
  const hash = otpService.hashOtp(otp);
  const expiresAt = otpService.otpExpiresAt();

  await userService.setOtp(telegramUserId, hash, expiresAt);

  try {
    await evolutionService.sendTextMessage(
      telegramUserId,
      user.phone_number,
      `Your EvoBot verification code is: ${otp}\n\nThis code expires in ${env.OTP_EXPIRY_MINUTES} minutes.\nDo not share this code with anyone.`
    );
  } catch (err) {
    console.error('Resend OTP error:', err.message);
    await ctx.reply(
      '❌ Could not send the code to WhatsApp. Try again later.',
      unverifiedMenu()
    );
    return;
  }

  // Clear any previous OTP-input state and start fresh
  awaitingOtp.add(telegramUserId);

  await ctx.reply(
    `📧 A new verification code has been sent to your WhatsApp number *${user.phone_number}*\\.\n\nEnter the code below\\.\\.\\. `,
    {
      parse_mode: 'MarkdownV2',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('❌ Cancel', 'action_cancel')],
      ]),
    }
  );
});

// ─── RECONNECT (requires verification) ──────────────────────────────────────

bot.action('action_reconnect', async (ctx) => {
  if (!(await requireVerifiedUser(ctx))) return;

  const telegramUserId = ctx.from.id;
  const user = await userService.findByTelegramId(telegramUserId);

  if (!user) {
    await ctx.reply('⚠️ You don\'t have an instance yet. Click *Connect* first.', verifiedMenu());
    return;
  }

  await ctx.reply('⏳ Reconnecting your instance...');

  try {
    const result = await evolutionService.reconnect(telegramUserId);
    await userService.updateStatus(telegramUserId, 'pending_qr');

    if (result.type === 'pairing_code') {
      await ctx.reply(
        `🔑 *New Pairing Code:* \`${escapeMd(result.value)}\`\n\nEnter this in WhatsApp → Linked Devices\\.`,
        { parse_mode: 'MarkdownV2' }
      );
    } else if (result.type === 'qr') {
      const buffer = Buffer.from(result.value, 'base64');
      await ctx.replyWithPhoto(
        { source: buffer },
        { caption: 'Scan this new QR code in WhatsApp → Linked Devices.' }
      );
    } else {
      await ctx.reply('⚠️ No QR or pairing code returned. Your instance may already be connected.');
    }

    await ctx.reply('What would you like to do next?', verifiedMenu());
  } catch (err) {
    console.error('Reconnect error:', err.message);
    await ctx.reply(`❌ Reconnect failed: ${escapeHtml(err.message)}`, verifiedMenu());
  }
});

// ─── DISCONNECT (requires verification) ─────────────────────────────────────

bot.action('action_disconnect', async (ctx) => {
  if (!(await requireVerifiedUser(ctx))) return;

  const user = await userService.findByTelegramId(ctx.from.id);
  if (!user) {
    await ctx.reply('⚠️ You don\'t have an instance yet. Click *Connect* first.', verifiedMenu());
    return;
  }

  await ctx.reply(
    '🔌 Are you sure you want to disconnect? You can always reconnect later.',
    confirmDisconnect()
  );
});

bot.action('action_disconnect_confirm', async (ctx) => {
  if (!(await requireVerifiedUser(ctx))) return;

  const telegramUserId = ctx.from.id;
  await ctx.reply('⏳ Disconnecting...');

  try {
    await evolutionService.logout(telegramUserId);
    await userService.updateStatus(telegramUserId, 'disconnected');
    await ctx.reply('✅ Disconnected. Click *Reconnect* whenever you want to link again.', verifiedMenu());
  } catch (err) {
    console.error('Disconnect error:', err.message);
    await ctx.reply(`❌ Disconnect failed: ${escapeHtml(err.message)}`, verifiedMenu());
  }
});

// ─── DELETE (requires verification) ─────────────────────────────────────────

bot.action('action_delete', async (ctx) => {
  if (!(await requireVerifiedUser(ctx))) return;

  const user = await userService.findByTelegramId(ctx.from.id);
  if (!user) {
    await ctx.reply('⚠️ You don\'t have an instance to delete.', verifiedMenu());
    return;
  }

  await ctx.reply(
    '🗑️ *This will permanently delete your WhatsApp instance and all associated data\\.*\n\nAre you sure\\?',
    { parse_mode: 'MarkdownV2', ...confirmDelete() }
  );
});

bot.action('action_delete_confirm', async (ctx) => {
  if (!(await requireVerifiedUser(ctx))) return;

  const telegramUserId = ctx.from.id;
  await ctx.reply('⏳ Deleting instance...');

  try {
    await evolutionService.deleteInstance(telegramUserId);
    await userService.deleteUser(telegramUserId);
    await ctx.reply('✅ Instance deleted. All data removed.', unverifiedMenu());
  } catch (err) {
    console.error('Delete error:', err.message);
    await ctx.reply(`❌ Delete failed: ${escapeHtml(err.message)}`, verifiedMenu());
  }
});

// ─── STATUS (requires verification) ─────────────────────────────────────────

bot.action('action_status', async (ctx) => {
  if (!(await requireVerifiedUser(ctx))) return;

  const telegramUserId = ctx.from.id;
  const user = await userService.findByTelegramId(telegramUserId);

  if (!user) {
    await ctx.reply('ℹ️ You don\'t have an instance yet. Click *Connect* to get started.', verifiedMenu());
    return;
  }

  await ctx.reply('⏳ Checking status...');

  try {
    const remoteStatus = await evolutionService.fetchStatus(telegramUserId);

    if (remoteStatus !== 'not_found') {
      await userService.updateStatus(telegramUserId, remoteStatus);
    }

    const label = statusEmoji(remoteStatus);
    await ctx.reply(
      `📊 *Instance:* \`${escapeMd(user.instance_name)}\`\n📱 *Phone:* \`${escapeMd(user.phone_number || 'N/A')}\`\n${label} *Status:* \`${escapeMd(remoteStatus)}\``,
      { parse_mode: 'MarkdownV2' }
    );
    await ctx.reply('What would you like to do next?', verifiedMenu());
  } catch (err) {
    console.error('Status error:', err.message);
    await ctx.reply(`❌ Could not fetch status: ${escapeHtml(err.message)}`, verifiedMenu());
  }
});

// ─── CANCEL ───────────────────────────────────────────────────────────────────

bot.action('action_cancel', async (ctx) => {
  awaitingPhone.delete(ctx.from.id);
  awaitingOtp.delete(ctx.from.id);

  const menu = await menuForUser(ctx.from.id);
  await ctx.reply('↩️ Cancelled.', menu);
});

module.exports = bot;