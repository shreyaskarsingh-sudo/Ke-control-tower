# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GoKwik CSM Control Tower — an internal Node.js/Express dashboard for GoKwik Customer Success Managers. It aggregates Jira, Slack, Gmail, and WhatsApp (via Periskope) data into a single web UI, with a backend proxy so API credentials never reach the browser.

## Running the Project

```bash
npm install
cp .env.example .env        # Fill in Slack, Jira, Gmail, Periskope tokens
cp users.json.example users.json  # Add per-CSM credentials
node server.js              # http://localhost:3000/dashboard.html
```

Or use the one-click script: `./start.sh`

**Production (EC2 + PM2):**
```bash
npm run prod                # pm2 start ecosystem.config.js
pm2 logs csm-control-tower  # Logs also written to logs/error.log + logs/out.log
pm2 restart csm-control-tower
```

No build step — the frontend is a single static HTML file served directly. There is no test suite.

## Architecture

**Two files do almost all the work:**

- `server.js` — Express backend (~550 lines). Proxies requests to Slack, Jira, Gmail, and Periskope (WhatsApp) so tokens stay server-side. Loads per-CSM credentials from `users.json` once at startup.
- `dashboard.html` — Single-page frontend (≈90 KB) with embedded CSS and JS. No framework, no bundler. GoKwik navy/teal brand palette defined in CSS custom properties at the top.

**Data flow:**
1. User selects a CSM in the dropdown → frontend calls `POST /api/sync` with `{ user_id }`
2. Server fetches Jira tickets (JQL: reporter = user, created ≥ 2026-01-01, not Done) + Slack DMs in parallel using that CSM's credentials
3. Frontend renders results and lets the CSM send DMs (`POST /api/slack/send`), post Jira comments (`POST /api/jira/comment`), or create Gmail drafts (`POST /api/gmail/draft`)
4. WhatsApp group chats are fetched separately from Periskope (both KwikEngage phones, merged by `chat_id`)
5. Auto-sync polls every 30 seconds

**Credential model:**
- `.env` — shared config (Slack token, Jira domain, Periskope keys, server port)
- `users.json` — per-CSM override credentials (Jira email/token, Gmail OAuth tokens, Slack token, Slack user ID, DM channel IDs). Each top-level key is a `user_id` string.

**Unanswered Slack DM detection:** `slack_user_id` in `users.json` identifies the CSM's own Slack user ID. A DM is flagged unanswered when the last message's `user` field differs from `slack_user_id`.

**Jira comments use Atlassian Document Format (ADF):** Plain text is wrapped in a `doc → paragraph → text` ADF object before posting to `/rest/api/3/issue/:key/comment`.

## Key API Routes

| Route | Purpose |
|-------|---------|
| `GET /api/health` | Server status + config validation |
| `GET /api/users` | List CSMs from `users.json` (id, name, email only — no tokens) |
| `POST /api/sync` | Fetch fresh Jira + Slack data for a user |
| `POST /api/slack/send` | Send a DM via Slack API |
| `POST /api/jira/comment` | Post an ADF comment to a Jira ticket |
| `POST /api/gmail/draft` | Create a Gmail draft (OAuth 2.0) |
| `GET /api/periskope/chats` | All WhatsApp groups from both KwikEngage phones, merged |
| `GET /api/periskope/chats/:id/messages` | Last 50 messages for a chat (tries PHONE_1, falls back to PHONE_2) |
| `GET /api/periskope/tickets` | Periskope tickets merged across both phones |
| `GET /api/periskope/tasks` | Periskope tasks merged across both phones |

## Configuration Files

| File | Status | Purpose |
|------|--------|---------|
| `.env` | Gitignored | Shared tokens and server config |
| `users.json` | Gitignored | Per-CSM credentials and Slack channel IDs |
| `ecosystem.config.js` | Tracked | PM2 production config |
| `nginx.conf` | Tracked | Nginx reverse proxy config for EC2 |

## Adding a New CSM

Add an entry to `users.json` following the schema in `users.json.example`. Required fields: `display_name`, `JIRA_EMAIL`, `JIRA_TOKEN`. Optional but important: `slack_user_id` (for unanswered detection), `slack_dm_channels` (map of display name → Slack channel ID, e.g. `"D08M9G579TN"`), and Gmail OAuth fields. Restart the server after editing — `users.json` is loaded once at startup.

## Gmail OAuth

Gmail uses OAuth 2.0 refresh tokens (not a simple API key). Each CSM needs `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN` in `users.json`. The server exchanges the refresh token for an access token on each request via the `googleapis` library. Global fallbacks can be set in `.env` but per-user values in `users.json` take precedence.

## Periskope (WhatsApp)

Periskope is a WhatsApp Business API layer. The server uses two KwikEngage phone numbers (`PERISKOPE_PHONE_1`, `PERISKOPE_PHONE_2` in `.env`). All Periskope endpoints merge results from both phones by ID to avoid duplicates. Chat status (`pending` / `responded` / `closed` / `empty`) is derived from `latest_message.fromMe` on the server in `getChatStatus()`.
