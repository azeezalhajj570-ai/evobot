const crypto = require('crypto');
const env = require('../config/env');

/** Generate a cryptographically secure 6-digit OTP */
function generateOtp() {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Hash an OTP using HMAC-SHA256 with the server secret.
 * The raw OTP is never stored — only this hash is persisted.
 */
function hashOtp(otp) {
  return crypto.createHmac('sha256', env.OTP_SECRET).update(otp).digest('hex');
}

/**
 * Verify a plaintext OTP against a stored hash.
 * Uses constant-time comparison to prevent timing attacks.
 */
function verifyOtp(otp, storedHash) {
  if (!otp || !storedHash) return false;
  const computed = hashOtp(otp);
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(storedHash));
}

/** Check whether an OTP has expired based on its expires_at timestamp */
function isOtpExpired(user) {
  if (!user.otp_expires_at) return true;
  return new Date(user.otp_expires_at) < new Date();
}

/** Check whether an OTP is currently locked out due to too many failed attempts */
function isOtpLocked(user) {
  if (!user.otp_locked_until) return false;
  return new Date(user.otp_locked_until) > new Date();
}

/** Compute the lockout end time from now */
function lockoutUntil() {
  return new Date(Date.now() + env.OTP_LOCKOUT_MINUTES * 60 * 1000);
}

/** Compute the OTP expiry time from now */
function otpExpiresAt() {
  return new Date(Date.now() + env.OTP_EXPIRY_MINUTES * 60 * 1000);
}

module.exports = {
  generateOtp,
  hashOtp,
  verifyOtp,
  isOtpExpired,
  isOtpLocked,
  lockoutUntil,
  otpExpiresAt,
};