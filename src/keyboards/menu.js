const { Markup } = require('telegraf');

/** Main menu inline keyboard shown on /start and after most actions */
function mainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔗 Connect', 'action_connect')],
    [Markup.button.callback('🔄 Reconnect', 'action_reconnect')],
    [Markup.button.callback('🔌 Disconnect', 'action_disconnect')],
    [Markup.button.callback('🗑️ Delete', 'action_delete')],
    [Markup.button.callback('📊 Status', 'action_status')],
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

module.exports = { mainMenu, confirmDelete, confirmDisconnect };