# Outreach

Self-hosted email outreach tool. Upload leads from Excel, build a multi-step sequence with follow-ups, launch campaigns, and track opens, clicks and replies. Single-admin, password-protected; designed to run locally via `docker compose up` or `pnpm dev`.

## Architecture (draft)

```
apps/web     React + Vite + Tailwind + shadcn/ui
apps/api     Express + Prisma + SQLite + Nodemailer + imapflow
packages/shared   Shared TS types between web and api
prisma/      Schema + migrations
```

- Auth: single admin password from `.env`, bcrypt hash stored in SQLite, JWT in httpOnly cookie (30-day).
- Scheduler: DB-backed polling via `node-cron` every 60s — no Redis.
- Reply detection: IMAP polling via `imapflow` every 2 minutes when IMAP credentials are configured.
- Tracking: pixel + link rewrite, public endpoints under `/t/*`.

## Prerequisites

- Node 20+
- pnpm 9+

## Setup

```
cp .env.example .env
# edit JWT_SECRET, ADMIN_PASSWORD, ENCRYPTION_KEY
pnpm install
pnpm prisma migrate dev
pnpm dev
```

Web: http://localhost:5173 · API: http://localhost:3001

Generate a 32-byte hex `ENCRYPTION_KEY`:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Docker

```
docker compose up
```

## Build status

Phase 1 (scaffold + auth) is complete. Upcoming: SMTP settings, campaign wizard, sequence builder, sending engine, tracking, IMAP reply detection, export.

## License

MIT
