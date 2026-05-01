const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  EVOLUTION_API_URL: process.env.EVOLUTION_API_URL,
  EVOLUTION_API_KEY: process.env.EVOLUTION_API_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
};