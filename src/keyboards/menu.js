const { Markup } = require('telegraf');

/** Menu shown to verified users — full access */
function verifiedMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔗 Connect', 'action_connect')],
    [Markup.button.callback('🔄 Reconnect', 'action_reconnect')],
    [Markup.button.callback('🔌 Disconnect', 'action_disconnect')],
    [Markup.button.callback('🗑️ Delete', 'action_delete')],
    [Markup.button.callback('📊 Status', 'action_status')],
  ]);
}

/** Menu shown to unverified users — limited to connect and OTP actions */
function unverifiedMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔗 Connect', 'action_connect')],
    [Markup.button.callback('✅ Verify OTP', 'action_verify_otp')],
    [Markup.button.callback('🔄 Resend OTP', 'action_resend_otp')],
  ]);
}

/** Confirmation keyboard for destructive actions */
function confirmDelete() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Yes, delete everything', 'action_delete_confirm'),
      Markup.button.callback('❌ Cancel', 'action_cancel'),
    ],
  ]);
}

/** Confirmation keyboard for disconnect */
function confirmDisconnect() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Yes, disconnect', 'action_disconnect_confirm'),
      Markup.button.callback('❌ Cancel', 'action_cancel'),
    ],
  ]);
}

module.exports = { verifiedMenu, unverifiedMenu, confirmDelete, confirmDisconnect };