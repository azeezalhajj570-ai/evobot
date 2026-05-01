# EvoBot — Telegram ↔ WhatsApp Linker (via Evolution API)

A production-ready MVP Telegram bot that lets users link their WhatsApp accounts through Evolution API using inline buttons.

## Features

- **Connect** — Register a WhatsApp number, receive a QR code or pairing code
- **Reconnect** — Get a fresh QR / pairing code for an existing instance
- **Disconnect** — Logout from WhatsApp (instance preserved for reconnect)
- **Delete** — Permanently delete instance and all user data
- **Status** — Check current connection state

## Prerequisites

- Node.js >= 18
- PostgreSQL database (local, Supabase, or any hosted Postgres)
- A running Evolution API instance
- A Telegram bot token from [@BotFather](https://t.me/BotFather)

## Setup

### 1. Clone and install

```bash
git clone <your-repo-url> evobot
cd evobot
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

| Variable | Description |
|---|---|
| `BOT_TOKEN` | Telegram bot token from BotFather |
| `EVOLUTION_API_URL` | Base URL of your Evolution API (e.g. `http://localhost:8080`) |
| `EVOLUTION_API_KEY` | API key for Evolution API |
| `DATABASE_URL` | PostgreSQL connection string |

### 3. Create the database table

```bash
psql $DATABASE_URL -f schema.sql
```

Or run the SQL in `schema.sql` through your Supabase / database dashboard.

### 4. Run the bot

```bash
# Development
npm start

# Production (with PM2 or similar)
pm2 start index.js --name evobot
```

## Project Structure

```
evobot/
├── index.js                  # Entry point, starts bot
├── schema.sql                # Database schema
├── .env.example              # Environment template
├── package.json
└── src/
    ├── config/
    │   └── env.js            # Environment variable loader
    ├── handlers/
    │   └── bot.js             # All Telegram command & callback handlers
    ├── keyboards/
    │   └── menu.js           # Inline keyboard definitions
    └── services/
        ├── evolution.js      # Evolution API client
        └── users.js           # Database (PostgreSQL) user operations
```

## How It Works

1. User sends `/start` → sees inline buttons
2. **Connect**: Bot asks for WhatsApp number → validates → creates Evolution API instance named `tg_<telegram_id>` → returns QR image or pairing code
3. **Reconnect**: Fetches a new QR/pairing code for the existing instance
4. **Disconnect**: Logs out the WhatsApp session (instance stays for future reconnects)
5. **Delete**: Removes the Evolution API instance and all user data from the database
6. **Status**: Queries Evolution API for the instance connection state

## Evolution API Endpoints Used

| Action | Endpoint |
|---|---|
| Create instance | `POST /instance/create` |
| Connect instance | `POST /instance/connect/{name}` |
| Fetch status | `GET /instance/fetchInstances?instanceName={name}` |
| Logout | `POST /instance/logout/{name}` |
| Delete | `DELETE /instance/delete/{name}` |

## License

MIT