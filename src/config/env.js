const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  EVOLUTION_API_URL: process.env.EVOLUTION_API_URL,
  EVOLUTION_API_KEY: process.env.EVOLUTION_API_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
  OTP_SECRET: process.env.OTP_SECRET || 'default-dev-secret-change-in-production',
  OTP_EXPIRY_MINUTES: parseInt(process.env.OTP_EXPIRY_MINUTES || '5', 10),
  OTP_MAX_ATTEMPTS: 5,
  OTP_LOCKOUT_MINUTES: 15,
};