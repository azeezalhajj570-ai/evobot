-- Evobot WhatsApp-Telegram Linker: Database Schema

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    telegram_user_id BIGINT UNIQUE NOT NULL,
    phone_number VARCHAR(20),
    instance_name VARCHAR(100) UNIQUE NOT NULL,
    connection_status VARCHAR(30) DEFAULT 'disconnected',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_telegram_id ON users (telegram_user_id);
CREATE INDEX idx_users_instance_name ON users (instance_name);