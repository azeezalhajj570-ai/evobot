-- Evobot WhatsApp-Telegram Linker: Database Schema
--
-- Single-account policy:
--   - Each Telegram user can link exactly one WhatsApp account.
--   - telegram_user_id is UNIQUE (one instance per Telegram user).
--   - instance_name is UNIQUE ( Evolution API instance names must be unique).
--   - phone_number is UNIQUE (one WhatsApp number cannot be linked twice).

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    telegram_user_id BIGINT NOT NULL,
    phone_number VARCHAR(20),
    instance_name VARCHAR(100) NOT NULL,
    connection_status VARCHAR(30) DEFAULT 'disconnected',
    is_verified BOOLEAN DEFAULT false,
    otp_hash TEXT,
    otp_expires_at TIMESTAMP,
    otp_attempts INTEGER DEFAULT 0,
    otp_locked_until TIMESTAMP,
    verified_at TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_telegram_user UNIQUE (telegram_user_id),
    CONSTRAINT unique_instance_name UNIQUE (instance_name),
    CONSTRAINT unique_phone_number UNIQUE (phone_number)
);

CREATE INDEX idx_users_telegram_id ON users (telegram_user_id);
CREATE INDEX idx_users_instance_name ON users (instance_name);

-- Migration: if you already have the old table without OTP / single-account columns, run:
-- ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT false;
-- ALTER TABLE users ADD COLUMN otp_hash TEXT;
-- ALTER TABLE users ADD COLUMN otp_expires_at TIMESTAMP;
-- ALTER TABLE users ADD COLUMN otp_attempts INTEGER DEFAULT 0;
-- ALTER TABLE users ADD COLUMN otp_locked_until TIMESTAMP;
-- ALTER TABLE users ADD COLUMN verified_at TIMESTAMP;
-- ALTER TABLE users ADD CONSTRAINT unique_telegram_user UNIQUE (telegram_user_id);
-- ALTER TABLE users ADD CONSTRAINT unique_instance_name UNIQUE (instance_name);
-- ALTER TABLE users ADD CONSTRAINT unique_phone_number UNIQUE (phone_number);