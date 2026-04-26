import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import cron from "node-cron";
import { decrypt } from "../lib/crypto.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";

function extractMessageIds(header: string | undefined | null): string[] {
  if (!header) return [];
  const matches = header.match(/<[^>]+>/g);
  return matches ? matches.map((m) => m) : [];
}

async function getLastPolled(smtpId: number): Promise<Date | null> {
  const row = await prisma.setting.findUnique({ where: { key: `imap:lastPolledAt:${smtpId}` } });
  if (!row) return null;
  const t = Date.parse(row.value);
  return Number.isFinite(t) ? new Date(t) : null;
}

async function setLastPolled(smtpId: number, d: Date) {
  await prisma.setting.upsert({
    where: { key: `imap:lastPolledAt:${smtpId}` },
    create: { key: `imap:lastPolledAt:${smtpId}`, value: d.toISOString() },
    update: { value: d.toISOString() },
  });
}

async function markReplied(messageIdRef: string): Promise<boolean> {
  const send = await prisma.emailSend.findFirst({ where: { messageId: messageIdRef } });
  if (!send) return false;
  const now = new Date();
  await prisma.$transaction([
    prisma.emailSend.update({ where: { id: send.id }, data: { repliedAt: now } }),
    prisma.lead.update({ where: { id: send.leadId }, data: { status: "replied" } }),
    prisma.emailSend.updateMany({
      where: { leadId: send.leadId, sentAt: null, failedAt: null },
      data: { failedAt: now, errorMessage: "lead replied" },
    }),
  ]);
  logger.info("reply detected", { sendId: send.id, leadId: send.leadId });
  return true;
}

async function markBounced(bouncedEmail: string): Promise<boolean> {
  const lead = await prisma.lead.findFirst({
    where: {
      email: bouncedEmail,
      campaign: { status: { in: ["active", "paused"] } },
    },
  });
  if (!lead) return false;
  const now = new Date();
  await prisma.$transaction([
    prisma.lead.update({ where: { id: lead.id }, data: { status: "bounced" } }),
    prisma.emailSend.updateMany({
      where: { leadId: lead.id, sentAt: null, failedAt: null },
      data: { failedAt: now, bouncedAt: now, errorMessage: "bounced via DSN" },
    }),
  ]);
  logger.info("bounce detected via DSN", { leadId: lead.id, email: bouncedEmail });
  return true;
}

async function pollOne(smtpId: number): Promise<void> {
  const cfg = await prisma.smtpConfig.findUnique({ where: { id: smtpId } });
  if (!cfg || !cfg.imapHost || !cfg.imapPort || !cfg.imapPass) return;

  const client = new ImapFlow({
    host: cfg.imapHost,
    port: cfg.imapPort,
    secure: true,
    auth: { user: cfg.imapUser ?? cfg.username, pass: decrypt(cfg.imapPass) },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = (await getLastPolled(smtpId)) ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
      const searchResult = await client.search({ since });
      if (!searchResult || searchResult.length === 0) {
        await setLastPolled(smtpId, new Date());
        return;
      }
      for await (const msg of client.fetch(searchResult, {
        source: true,
        envelope: true,
        bodyStructure: true,
      })) {
        const source = msg.source;
        if (!source) continue;
        const parsed = await simpleParser(source);
        const refs = [
          ...extractMessageIds(parsed.headers.get("in-reply-to") as string | undefined),
          ...extractMessageIds(parsed.headers.get("references") as string | undefined),
        ];
        let matched = false;
        for (const ref of refs) {
          if (await markReplied(ref)) {
            matched = true;
            break;
          }
        }
        if (matched) continue;

        const contentType = (parsed.headers.get("content-type") as { value?: string } | string | undefined) ?? "";
        const ctStr = typeof contentType === "string" ? contentType : (contentType.value ?? "");
        const fromAddr = parsed.from?.value?.[0]?.address?.toLowerCase() ?? "";
        const isDsn = /multipart\/report/i.test(ctStr) || /mailer-daemon|postmaster/i.test(fromAddr);
        if (isDsn) {
          const body = (parsed.text ?? "") + " " + (parsed.html || "");
          const bounced = body.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? [];
          for (const addr of bounced) {
            if (await markBounced(addr)) break;
          }
        }
      }
      await setLastPolled(smtpId, new Date());
    } finally {
      lock.release();
    }
  } catch (err) {
    logger.warn("imap poll failed", { smtpId, message: err instanceof Error ? err.message : String(err) });
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore
    }
  }
}

let running = false;

export async function pollTick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const configs = await prisma.smtpConfig.findMany({
      where: { imapHost: { not: null }, imapPass: { not: null } },
    });
    for (const c of configs) {
      await pollOne(c.id);
    }
  } finally {
    running = false;
  }
}

export function startImapPoller(): void {
  cron.schedule("*/2 * * * *", () => {
    pollTick().catch((err) => {
      logger.error("imap poll tick failed", { message: err instanceof Error ? err.message : String(err) });
    });
  });
  logger.info("imap poller started");
}
