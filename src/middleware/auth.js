const userService = require('../services/users');

/**
 * Middleware / guard function that checks whether the user is verified.
 * Returns true if verified. If not, sends a verification prompt to the
 * Telegram chat and returns false so the caller can bail out.
 */
async function requireVerifiedUser(ctx) {
  const telegramUserId = ctx.from.id;
  const user = await userService.findByTelegramId(telegramUserId);

  if (!user) {
    await ctx.reply(
      '⚠️ You don\'t have an instance yet. Click *Connect* to get started.',
      { parse_mode: 'Markdown' }
    );
    return false;
  }

  if (user.is_verified) {
    return true;
  }

  // Check if locked out
  const { isOtpLocked } = require('../services/otp');
  if (isOtpLocked(user)) {
    const lockedUntil = new Date(user.otp_locked_until);
    await ctx.reply(
      `🔒 Too many failed attempts. Verification is locked until *${lockedUntil.toLocaleTimeString()}*.\n\nPlease try again later or click *Resend OTP* to get a new code.`,
      { parse_mode: 'Markdown' }
    );
    return false;
  }

  await ctx.reply(
    '🔐 *Verification required.*\n\nPlease verify your WhatsApp number before using this feature.\nClick *Verify OTP* to receive a code on WhatsApp.',
    { parse_mode: 'Markdown' }
  );
  return false;
}

module.exports = { requireVerifiedUser };