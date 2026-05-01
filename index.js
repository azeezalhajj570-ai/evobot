require('dotenv').config();
const env = require('./config/env');
const bot = require('./handlers/bot');
const userService = require('./services/users');

// Validate required environment variables on startup
const required = ['BOT_TOKEN', 'EVOLUTION_API_URL', 'EVOLUTION_API_KEY', 'DATABASE_URL'];
const missing = required.filter((key) => !env[key]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  console.error('Copy .env.example to .env and fill in the values.');
  process.exit(1);
}

// Graceful shutdown helper
async function shutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  await bot.stop(signal);
  await userService.close();
  process.exit(0);
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

// Start polling
bot.launch().then(() => {
  console.log('✅ EvoBot is running.');
});

module.exports = bot;