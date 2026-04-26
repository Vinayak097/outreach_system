# Outreach

Self-hosted email outreach tool. Upload an Excel list of leads, build a multi-step email sequence with follow-ups, launch a campaign, and track opens, clicks and replies. Single-admin, password-protected; runs locally via `pnpm dev` or `docker compose up`.

## Architecture

```
┌──────────────────┐   HTTP+JSON   ┌──────────────────┐   Prisma    ┌──────────┐
│  apps/web        │ ───────────▶  │  apps/api        │ ──────────▶ │ SQLite   │
│  React + Vite    │               │  Express + TS    │             │ dev.db   │
│  Tailwind        │               │                  │             └──────────┘
│  shadcn/radix    │               │  node-cron tick  │───► Nodemailer SMTP
│  sonner toasts   │               │  imapflow poller │◀── IMAP INBOX
└──────────────────┘               └──────────────────┘
                                       ▲
                                       │ tracking pixel + link redirect
                                       │
                                    public /t/* endpoints (no auth)
```

More detail in [ARCHITECTURE.md](ARCHITECTURE.md).

## Prerequisites

- Node 20+
- pnpm 9+

## Local setup

```
cp .env.example .env
# edit .env — set ADMIN_PASSWORD, JWT_SECRET, ENCRYPTION_KEY
pnpm install
pnpm prisma migrate dev
pnpm dev
```

Web at http://localhost:5173 · API at http://localhost:3001.

Generate secrets:

```
# 32-byte encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# JWT secret
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Docker

```
docker compose up --build
```

Persists the SQLite DB to a named volume.

## SMTP setup

The Settings page has a provider picker. Gmail is the default — fill in **Label**, **Email**, and a **Google App Password**; everything else auto-fills. IMAP for reply detection is auto-filled too.

### Gmail

1. Enable 2-step verification on your Google account.
2. Create an App Password at https://myaccount.google.com/apppasswords.
3. In Outreach Settings: choose **Gmail**, paste the 16-character app password.

### Outlook / Office 365

Choose **Outlook / Office 365** in the provider picker. Use your account password (or app password if MFA is on). Admin may need to allow SMTP AUTH for your tenant.

### Custom SMTP

Choose **Custom SMTP** and expand *Advanced* to fill in host, port, TLS mode, and optional IMAP credentials.

## Excel format

Any columns work — **email is the only required column**. The wizard maps columns to lead fields (first name, last name, company, job title) plus any number of custom columns you reference in templates.

**Reply status column (optional).** If your sheet has a column indicating which leads already replied to a prior outreach, map it to *Reply status*. Rows where that column contains `yes`, `y`, `true`, `1`, or `replied` (case-insensitive) are imported as already-replied and never sent to.

## Template variables

Available inside subject + body templates (and reusable saved templates):

- `{{first_name}}`, `{{last_name}}`, `{{company}}`, `{{job_title}}`, `{{email}}`
- `{{sender_name}}` — the "From name" on the SMTP config
- `{{custom.<your_key>}}` — any custom column, using the `slugged_column_name`

Missing variables render as empty string (a warning is logged).

## Templates (reusable snippets)

`/templates` lets you save a subject + body once and insert it into any sequence step with one click. Edits to a template don't retroactively change campaigns that already used it — the text is copied at insert time.

## Reply detection

When IMAP credentials are configured on an SMTP account, a cron-scheduled poller runs every 2 minutes:

1. Connects to the INBOX via `imapflow`.
2. Fetches messages since last poll.
3. Matches `In-Reply-To` / `References` headers against the `Message-ID`s of sent emails.
4. On match: marks the lead as **replied**, stamps `repliedAt`, and **cancels all future queued sends** for that lead.
5. Also scans for Delivery Status Notifications (`multipart/report` or `mailer-daemon`/`postmaster` senders) to detect bounces and mark leads accordingly.

Without IMAP, replies aren't auto-detected — you can still export the lead list and update reply status manually in Excel, then re-import.

## Deliverability

Cold outreach only works if emails actually reach the inbox.

- **SPF / DKIM / DMARC**: set all three on your sending domain. SPF authorizes your SMTP provider; DKIM signs outgoing mail; DMARC tells receivers what to do when auth fails.
- **Warm up a new domain**: send small volume (5–10/day) for 2–3 weeks before ramping up. Mix genuine conversations with outreach.
- **Dedicated sending domain**: prefer `outreach.yourco.com` or a parallel `.io` / `.co` variant so that deliverability issues don't affect your primary domain.
- **Respect SMTP rate limits**: the `Daily limit` on each SMTP config caps sends per account per calendar day. Gmail caps free accounts around 500/day; workspace accounts ~2000/day.
- **Jitter**: the scheduler inserts a random 30–90s gap between sends on the same SMTP account so the pattern doesn't look like a blast.

## Known limitations

- **No unsubscribe handling** by design. The app doesn't inject an unsubscribe link or provide a `/unsubscribe` endpoint. If you need this, fork and add it.
- **Single admin user**. No teams, no roles.
- **No LinkedIn / Apollo / 3rd-party integration**.
- **SQLite**. One process at a time writes the DB; fine for local / small-team use.

## Testing

```
pnpm --filter @outreach/api test
```

Covers: template rendering, column-mapping validation, `replyStatus` import rule, scheduler tick (daily-limit + jitter).

## License

MIT
