/**
 * DATABASE SCHEMA REFERENCE
 *
 * Database: SQLite (via Prisma)
 * This file is purely for developer understanding — it is never imported at runtime.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ENTITY OVERVIEW
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  User
 *  └── just an auth record (hashed password). One global admin user.
 *
 *  SmtpConfig  (one per sending account)
 *  └── Campaign[]         a config can be reused across many campaigns
 *
 *  Campaign  (one outreach campaign = one lead list + one sequence)
 *  ├── Lead[]             every contact imported from the spreadsheet
 *  └── SequenceStep[]     ordered email steps (step 1, 2, 3 …)
 *
 *  SequenceStep  (one email in the sequence)
 *  ├── StepSegmentRule[]  per-segment template overrides for this step
 *  └── EmailSend[]        actual send records (one per lead × step)
 *
 *  Template  (reusable subject + body, supports {{handlebars}})
 *  ├── used as SequenceStep.defaultTemplate
 *  ├── used as StepSegmentRule.template  (segment override)
 *  └── recorded on EmailSend.resolvedTemplate  (what was actually sent)
 *
 *  EmailSend  (one scheduled/sent email)
 *  ├── belongs to Lead  +  SequenceStep
 *  └── tracks full engagement lifecycle (sent → opened → clicked → replied / bounced)
 *
 *  Setting  (key/value store — e.g. reply-detection state)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MODELS IN DETAIL
 * ─────────────────────────────────────────────────────────────────────────────

 * ┌─────────────────────────────────────────────────────────────┐
 * │  User                                                        │
 * ├──────────────────┬──────────────────────────────────────────┤
 * │  id              │  PK, autoincrement                        │
 * │  passwordHash    │  bcrypt hash of the admin password        │
 * │  createdAt       │  timestamp                                │
 * └──────────────────┴──────────────────────────────────────────┘

 * ┌─────────────────────────────────────────────────────────────┐
 * │  SmtpConfig                                                  │
 * ├──────────────────┬──────────────────────────────────────────┤
 * │  id              │  PK                                       │
 * │  name            │  human label ("Gmail – sales@…")          │
 * │  host            │  SMTP host                                │
 * │  port            │  SMTP port                                │
 * │  secure          │  TLS on/off (default true)                │
 * │  username        │  SMTP login                               │
 * │  password        │  SMTP password (stored plaintext in DB)   │
 * │  fromName        │  "Display Name" in From header            │
 * │  fromEmail       │  sender address                           │
 * │  imapHost?       │  IMAP host for reply detection            │
 * │  imapPort?       │  IMAP port                                │
 * │  imapUser?       │  IMAP login (often same as SMTP username) │
 * │  imapPass?       │  IMAP password                            │
 * │  dailyLimit      │  max emails to send per day (default 50)  │
 * │  createdAt       │  timestamp                                │
 * └──────────────────┴──────────────────────────────────────────┘

 * ┌─────────────────────────────────────────────────────────────┐
 * │  Campaign                                                    │
 * ├──────────────────┬──────────────────────────────────────────┤
 * │  id              │  PK                                       │
 * │  name            │  human label                              │
 * │  status          │  "draft" | "active" | "paused" |          │
 * │                  │  "completed"  (default "draft")           │
 * │  smtpConfigId    │  FK → SmtpConfig                          │
 * │  originalFileName│  uploaded spreadsheet filename            │
 * │  columnMapping   │  JSON (ColumnMapping) — which spreadsheet │
 * │                  │  column maps to email / firstName / etc.  │
 * │  originalHeaders │  JSON string[] — all headers in the sheet │
 * │  segmentColumn   │  which column drives template branching   │
 * │                  │  e.g. "Industry" or "Plan"                │
 * │  createdAt       │  timestamp                                │
 * └──────────────────┴──────────────────────────────────────────┘
 *
 *  ColumnMapping shape (stored as JSON in columnMapping):
 *  {
 *    email: string           // required — column name for email address
 *    firstName?: string
 *    lastName?: string
 *    company?: string
 *    jobTitle?: string
 *    replyStatus?: string    // pre-existing reply column in sheet
 *    emailSentStatus?: string
 *    segmentColumn?: string  // redundant with Campaign.segmentColumn
 *    custom: string[]        // extra columns stored in Lead.customFields
 *  }

 * ┌─────────────────────────────────────────────────────────────┐
 * │  Lead                                                        │
 * ├──────────────────┬──────────────────────────────────────────┤
 * │  id              │  PK                                       │
 * │  campaignId      │  FK → Campaign (CASCADE delete)           │
 * │  email           │  contact email address                    │
 * │  firstName?      │                                           │
 * │  lastName?       │                                           │
 * │  company?        │                                           │
 * │  jobTitle?       │                                           │
 * │  customFields    │  JSON Record<string,string> — any extra   │
 * │                  │  columns from the sheet (incl. segment    │
 * │                  │  column value, e.g. { "Industry": "SaaS"})│
 * │  rawRow          │  JSON Record<string,string> — full        │
 * │                  │  original spreadsheet row, used for       │
 * │                  │  segment value lookup & template render   │
 * │  sourceRowIndex  │  row number in the original file          │
 * │  status          │  "pending" | "queued" | "sent" |          │
 * │                  │  "opened" | "clicked" | "replied" |       │
 * │                  │  "bounced" | "failed"  (default "pending")│
 * │  currentStep     │  last step order that was processed (0=none)│
 * │  createdAt       │  timestamp                                │
 * └──────────────────┴──────────────────────────────────────────┘
 *  Index: (campaignId, status)
 *
 *  HOW TO GET A LEAD'S SEGMENT VALUE:
 *    lead.customFields[campaign.segmentColumn]
 *    — e.g. if segmentColumn = "Industry", the value is lead.customFields["Industry"]

 * ┌─────────────────────────────────────────────────────────────┐
 * │  SequenceStep                                                │
 * ├──────────────────┬──────────────────────────────────────────┤
 * │  id              │  PK                                       │
 * │  campaignId      │  FK → Campaign (CASCADE delete)           │
 * │  order           │  1-based position in the sequence         │
 * │  subjectTpl      │  Handlebars subject (fallback if no tpl)  │
 * │  bodyTpl         │  Handlebars body   (fallback if no tpl)   │
 * │  delayDays       │  days after previous step to wait         │
 * │                  │  (step 1 is always immediate, delay=0)    │
 * │  defaultTemplateId? │ FK → Template — used when no segment  │
 * │                  │  rule matches the lead                    │
 * └──────────────────┴──────────────────────────────────────────┘
 *
 *  TEMPLATE RESOLUTION ORDER (per lead × step):
 *  1. Find StepSegmentRule where segmentValue == lead.customFields[segmentColumn]
 *  2. If found → use rule.template
 *  3. Else if defaultTemplateId set → use defaultTemplate
 *  4. Else → render subjectTpl / bodyTpl directly as Handlebars

 * ┌─────────────────────────────────────────────────────────────┐
 * │  StepSegmentRule                                             │
 * ├──────────────────┬──────────────────────────────────────────┤
 * │  id              │  PK                                       │
 * │  stepId          │  FK → SequenceStep (CASCADE delete)       │
 * │  segmentValue    │  exact value to match in the lead's       │
 * │                  │  segment column, e.g. "SaaS"              │
 * │  templateId      │  FK → Template — template to use for      │
 * │                  │  leads with this segment value            │
 * └──────────────────┴──────────────────────────────────────────┘
 *  Unique: (stepId, segmentValue) — one rule per value per step

 * ┌─────────────────────────────────────────────────────────────┐
 * │  EmailSend                                                   │
 * ├──────────────────┬──────────────────────────────────────────┤
 * │  id              │  PK                                       │
 * │  leadId          │  FK → Lead (CASCADE delete)               │
 * │  stepId          │  FK → SequenceStep                        │
 * │  messageId?      │  SMTP Message-ID header (set after send)  │
 * │  trackingId      │  UUID — used in open/click pixel URLs     │
 * │  resolvedTemplateId? │ FK → Template — the template that    │
 * │                  │  was actually selected and rendered       │
 * │  scheduledFor    │  when this send is due                    │
 * │  sentAt?         │  when SMTP accepted the message           │
 * │  openedAt?       │  when pixel was loaded (first open)       │
 * │  clickedAt?      │  when a tracked link was clicked          │
 * │  repliedAt?      │  when a reply was detected via IMAP       │
 * │  bouncedAt?      │  when a bounce was received               │
 * │  failedAt?       │  when send failed (non-bounce error)      │
 * │  errorMessage?   │  error detail on failure                  │
 * └──────────────────┴──────────────────────────────────────────┘
 *  Indexes: (scheduledFor, sentAt)  — scheduler query
 *           (messageId)             — bounce / reply matching
 *  Unique:  trackingId

 * ┌─────────────────────────────────────────────────────────────┐
 * │  Template                                                    │
 * ├──────────────────┬──────────────────────────────────────────┤
 * │  id              │  PK                                       │
 * │  name            │  human label shown in UI                  │
 * │  subject         │  Handlebars subject line                  │
 * │  body            │  Handlebars plain-text body               │
 * │  createdAt       │  timestamp                                │
 * │  updatedAt       │  auto-updated on save                     │
 * └──────────────────┴──────────────────────────────────────────┘
 *  Used by: SequenceStep.defaultTemplate
 *           StepSegmentRule.template
 *           EmailSend.resolvedTemplate

 * ┌─────────────────────────────────────────────────────────────┐
 * │  Setting                                                     │
 * ├──────────────────┬──────────────────────────────────────────┤
 * │  key             │  PK string                                │
 * │  value           │  string (JSON or plain)                   │
 * └──────────────────┴──────────────────────────────────────────┘
 *  Current known keys:
 *    "imap_last_uid_<smtpConfigId>"  — last processed IMAP UID per account

 * ─────────────────────────────────────────────────────────────────────────────
 * KEY DATA FLOWS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  IMPORT FLOW
 *  ──────────────
 *  1. POST /campaigns/:id/upload  → parses spreadsheet, caches buffer in memory
 *  2. POST /campaigns/:id/import  → planImport() deduplicates by email,
 *     creates Lead rows, stores ColumnMapping + segmentColumn on Campaign
 *
 *  LAUNCH FLOW
 *  ─────────────
 *  1. POST /campaigns/:id/launch  → creates EmailSend rows for step 1
 *     for all "pending" leads, sets Campaign.status = "active"
 *  2. Scheduler (sender.ts) polls every minute for EmailSend rows where
 *     scheduledFor <= now && sentAt IS NULL
 *  3. For each send: resolves template (segment rule → default → inline),
 *     renders Handlebars with lead.rawRow data, sends via nodemailer,
 *     sets resolvedTemplateId + sentAt, updates Lead.status + currentStep
 *  4. After send, scheduler enqueues next step's EmailSend
 *     (scheduledFor = sentAt + step.delayDays days)
 *
 *  TRACKING FLOW
 *  ──────────────
 *  Open pixel:  GET /track/open/:trackingId  → sets EmailSend.openedAt
 *  Link click:  GET /track/click/:trackingId → sets EmailSend.clickedAt, redirects
 *  Reply (IMAP): imapPoller.ts polls inbox, matches Message-ID to EmailSend,
 *                sets EmailSend.repliedAt + Lead.status = "replied"
 *
 *  STATUS PRECEDENCE (Lead.status, highest wins)
 *  ──────────────────────────────────────────────
 *  replied > clicked > opened > bounced > failed > sent > queued > pending
 */

export {};
