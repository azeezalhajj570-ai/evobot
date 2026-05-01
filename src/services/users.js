const { Pool } = require('pg');
const env = require('../config/env');

const pool = new Pool({ connectionString: env.DATABASE_URL });

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

module.exports = {
  /** Find a user by their Telegram user ID */
  async findByTelegramId(telegramUserId) {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE telegram_user_id = $1',
      [telegramUserId]
    );
    return rows[0] || null;
  },

  /** Create a new user record */
  async createUser({ telegramUserId, phoneNumber, instanceName, connectionStatus = 'disconnected' }) {
    const { rows } = await pool.query(
      `INSERT INTO users (telegram_user_id, phone_number, instance_name, connection_status)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (telegram_user_id) DO UPDATE SET
         phone_number = EXCLUDED.phone_number,
         instance_name = EXCLUDED.instance_name,
         updated_at = NOW()
       RETURNING *`,
      [telegramUserId, phoneNumber, instanceName, connectionStatus]
    );
    return rows[0];
  },

  /** Update the connection status for a user */
  async updateStatus(telegramUserId, status) {
    const { rows } = await pool.query(
      `UPDATE users SET connection_status = $1, updated_at = NOW()
       WHERE telegram_user_id = $2
       RETURNING *`,
      [status, telegramUserId]
    );
    return rows[0];
  },

  /** Update the phone number for a user */
  async updatePhoneNumber(telegramUserId, phoneNumber) {
    const { rows } = await pool.query(
      `UPDATE users SET phone_number = $1, updated_at = NOW()
       WHERE telegram_user_id = $2
       RETURNING *`,
      [phoneNumber, telegramUserId]
    );
    return rows[0];
  },

  /** Delete a user and their data */
  async deleteUser(telegramUserId) {
    const { rows } = await pool.query(
      'DELETE FROM users WHERE telegram_user_id = $1 RETURNING *',
      [telegramUserId]
    );
    return rows[0];
  },

  /** Close the database pool (for graceful shutdown) */
  async close() {
    await pool.end();
  },
};