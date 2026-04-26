# Architecture

Three long-running subsystems in `apps/api` drive the moving parts of the app: the **scheduler**, the **IMAP poller**, and the **tracking endpoints**. Everything else is request/response.

## Code layout

```
apps/api/src/
  index.ts              app bootstrap: middleware → routers → start scheduler + IMAP poller
  lib/
    config.ts           Zod-validated env, loaded from .env (root or apps/api)
    crypto.ts           AES-256-GCM encrypt/decrypt for SMTP + IMAP passwords
    json.ts             safe JSON parse with fallback
    logger.ts           leveled JSON lines to stdout/stderr
    prisma.ts           single PrismaClient instance
  middleware/
    auth.ts             JWT httpOnly cookie; issueToken + requireAuth
    error.ts            Zod → 400, HttpError passthrough, default 500
  routes/
    auth.ts             login / logout / me
    smtp.ts             SMTP CRUD + POST /:id/test (nodemailer)
    templates.ts        reusable subject+body snippets
    campaigns.ts        campaign CRUD + aggregate metrics
    campaignFlow.ts     upload, import, steps, launch, pause, resume, leads, export
    leads.ts            lead detail + timeline
    tracking.ts         /t/open/:id (1px gif)  /t/click/:id (302 redirect)
  services/
    bootstrap.ts        first-run admin user from ADMIN_PASSWORD
    excel.ts            exceljs parse + planImport (replyStatus rule + custom fields)
    templating.ts       {{var}} + {{custom.key}} renderer
    tracking.ts         pixel injection + link rewrite + hard-bounce heuristic
    sender.ts           single-send pipeline: template → pixel → send → schedule next
    scheduler.ts        cron (60s) — groups pending sends by SMTP, picks one per tick
    imapPoller.ts       cron (2m) — scans INBOX for replies + DSN bounces
    export.ts           streams .xlsx with appended tracking columns

apps/web/src/
  App.tsx               router + Toaster
  components/
    AppShell.tsx        sidebar + logout
    ProtectedRoute.tsx  checks /auth/me; redirects to /login
    ui/Dialog.tsx       Radix dialog wrapper
    ui/StatusBadge.tsx  colored pill per lead/campaign status
  lib/api.ts            typed fetch client for every backend endpoint
  pages/
    Login.tsx
    Dashboard.tsx       campaigns table + "New campaign" dialog
    NewCampaign.tsx     4-step wizard (upload / map / preview / sequence)
    CampaignDetail.tsx  metrics + tabs (Leads / Sequence / Settings) + lead timeline panel
    Templates.tsx       reusable snippets
    Settings.tsx        SMTP CRUD with Gmail / Outlook / Custom preset

packages/shared/src/index.ts    DTO + enum types consumed by both web and api

prisma/schema.prisma            SQLite schema
```

## Sending engine

`services/scheduler.ts` runs `tick()` every 60 seconds via `node-cron`.

Each tick:

1. Query all `EmailSend` rows where `sentAt IS NULL AND failedAt IS NULL AND scheduledFor <= now` **and** the parent campaign status is `active`.
2. Group candidates by `campaign.smtpConfigId`.
3. For each SMTP group:
   - Skip if `Setting[smtp:nextSendAt:<id>]` is in the future (jitter window from the last send).
   - Skip if today's sent-count for that SMTP >= `dailyLimit`.
   - Pick the earliest-scheduled candidate and call `sender.sendOne(id)`.
   - Write `Setting[smtp:nextSendAt:<id>] = now + random(30..90s)` so the next tick on this SMTP waits out the jitter.

This is deliberately one-send-per-SMTP-per-tick. Combined with the 60s tick interval and 30–90s jitter, it produces natural per-SMTP send spacing without a queue.

`sender.sendOne(sendId)`:

1. Load send + lead + step + campaign + SMTP config.
2. Skip if the lead is `replied` or `bounced` (mark this send `failedAt` with reason).
3. Render subject + body via `services/templating.ts` with lead + custom fields.
4. Convert plain-text body to minimal HTML if no tags present.
5. Rewrite every absolute `<a href>` through `/t/click/<trackingId>?url=<encoded>`.
6. Inject a 1×1 pixel pointing to `/t/open/<trackingId>` before `</body>`.
7. Send via Nodemailer using the decrypted SMTP password.
8. On success: stamp `sentAt` + `messageId`, mark the lead `sent`, and **enqueue the next step** with `scheduledFor = now + nextStep.delayDays * 24h`.
9. On SMTP error: stamp `failedAt` + `errorMessage`. If the error looks like a hard bounce (5xx / "user unknown" / etc.), also mark the lead `bounced`.

## Tracking

`/t/open/:trackingId` returns a 1×1 transparent GIF and stamps `openedAt` the first time it's hit. If the lead's status is `sent`, bumps it to `opened`.

`/t/click/:trackingId?url=<encoded>` stamps `clickedAt`, then 302-redirects to the original URL. Bumps lead status to `clicked` if it was `sent` or `opened`. Only absolute http(s) URLs are rewritten by the sender; `mailto:`, `tel:`, and relative links pass through untouched.

Neither endpoint requires auth — they're hit from the recipient's email client.

## Reply detection

`services/imapPoller.ts` runs every 2 minutes. For each SMTP config that has IMAP credentials:

1. Connect via `imapflow` using the decrypted IMAP password (or the SMTP password if IMAP password was left blank).
2. `SEARCH SINCE <lastPolledAt or 24h ago>`.
3. For each message, parse headers with `mailparser`.
4. Extract every `<Message-ID>` from `In-Reply-To` and `References` headers. For each, look up `EmailSend.messageId`. First match wins:
   - Mark the `EmailSend` `repliedAt = now`.
   - Mark the `Lead` as `replied`.
   - `UPDATE EmailSend SET failedAt = now, errorMessage = 'lead replied' WHERE leadId = ? AND sentAt IS NULL` — cancels all future queued sends for the lead.
5. If no reply matched but the message is a DSN (`Content-Type: multipart/report` or `mailer-daemon`/`postmaster` sender), scan the body for a bounced email address and match it to any lead in an active/paused campaign; mark that lead `bounced` and cancel its future sends.
6. Save `Setting[imap:lastPolledAt:<smtpId>] = now`.

A single module-level `running` flag prevents overlapping ticks.

## Data flow: launching a campaign

1. User uploads an Excel file — `POST /api/campaigns/:id/upload` parses with `exceljs` and caches the headers + buffer in memory keyed by campaign id.
2. User picks column mappings in the wizard — `POST /api/campaigns/:id/import` validates the mapping against the cached headers, re-parses the workbook, and runs `planImport()`:
   - rows with invalid email → skipped
   - rows whose mapped `replyStatus` value is truthy (`yes`/`y`/`true`/`1`/`replied`) → imported as `status=replied`
   - everything else → `status=pending`, with custom columns stored as JSON under slugged keys (`"Industry"` → `custom.industry`)
3. User edits sequence steps — `PUT /api/campaigns/:id/steps` replaces all steps (only while campaign is `draft`).
4. User launches — `POST /api/campaigns/:id/launch`:
   - validate: at least one step, no empty templates, at least one pending lead
   - for every `pending` lead, create one `EmailSend` for step 1 with `scheduledFor = now` and a new `trackingId`
   - set campaign status to `active`
5. The scheduler's next tick picks these up and sends them out subject to the per-SMTP jitter + daily limit rules.

## Security

- **Passwords at rest**: SMTP + IMAP passwords are AES-256-GCM encrypted using `ENCRYPTION_KEY` from env. A DB dump leaks ciphertext, not plaintext. `crypto.decrypt()` is only called inside `sender.ts` and `imapPoller.ts`.
- **Admin password**: bcrypt hashed, stored once on first startup from `ADMIN_PASSWORD`.
- **Session**: JWT in httpOnly cookie; 30-day expiry; `sameSite=lax`; `secure=true` when `NODE_ENV=production`.
- **API responses**: DTOs explicitly strip password fields. Stack traces never leak to the client.
- **Zod** validates every request body and query.

## What's deliberately missing

- No queue (no Redis, no BullMQ). The scheduler is just rows in `EmailSend` + a `node-cron` ticker.
- No retries on SMTP failure. A failed send is recorded and left alone — bring the error to the UI and let the operator decide.
- No unsubscribe link or `/unsubscribe` endpoint. Explicitly by spec.
- No multi-tenant, no per-user scoping. The one admin sees everything.
