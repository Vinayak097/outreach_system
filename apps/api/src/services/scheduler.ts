import cron from "node-cron";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import { sendOne } from "./sender.js";

function getJitterMs(): { min: number; max: number } {
  return {
    min: parseInt(process.env.SEND_JITTER_MIN_MS ?? "1000", 10),
    max: parseInt(process.env.SEND_JITTER_MAX_MS ?? "3000", 10),
  };
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

async function setNextSendAt(smtpId: number, ts: number) {
  const key = `smtp:nextSendAt:${smtpId}`;
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: String(ts) },
    update: { value: String(ts) },
  });
}

async function countSentToday(smtpId: number): Promise<number> {
  const since = startOfDay(new Date());
  return prisma.emailSend.count({
    where: {
      sentAt: { gte: since },
      step: { campaign: { smtpConfigId: smtpId } },
    },
  });
}

export async function tick(now: Date = new Date()): Promise<{ sent: number; skipped: number }> {
  const candidates = await prisma.emailSend.findMany({
    where: {
      sentAt: null,
      failedAt: null,
      scheduledFor: { lte: now },
      step: { campaign: { status: "active" } },
    },
    include: { step: { include: { campaign: { select: { smtpConfigId: true } } } } },
    orderBy: { scheduledFor: "asc" },
  });

  const bySmtp = new Map<number, typeof candidates>();
  for (const c of candidates) {
    const id = c.step.campaign.smtpConfigId;
    if (!bySmtp.has(id)) bySmtp.set(id, []);
    bySmtp.get(id)!.push(c);
  }

  let sent = 0;
  let skipped = 0;

  for (const [smtpId, list] of bySmtp.entries()) {
    const smtp = await prisma.smtpConfig.findUnique({ where: { id: smtpId } });
    if (!smtp) {
      skipped += list.length;
      continue;
    }
    const todayCount = await countSentToday(smtpId);
    if (todayCount >= smtp.dailyLimit) {
      skipped += list.length;
      continue;
    }

    if (list.length === 0) continue;
    const batchSize = Math.max(1, Math.min(list.length, smtp.dailyLimit - todayCount));
    const toSend = list.slice(0, batchSize);
    const { min, max } = getJitterMs();
    for (const item of toSend) {
      if (max > 0) {
        const jitter = min + Math.floor(Math.random() * Math.max(1, max - min));
        await new Promise((r) => setTimeout(r, jitter));
      }
      const outcome = await sendOne(item.id);
      if (outcome.kind === "sent") sent++;
      else skipped++;
    }
    await setNextSendAt(smtpId, Date.now());
  }

  if (sent > 0 || skipped > 0) {
    logger.info("scheduler tick", { sent, skipped, smtps: bySmtp.size });
  }
  return { sent, skipped };
}

let running = false;

export function startScheduler(): void {
  cron.schedule("*/15 * * * * *", () => {
    if (running) return;
    running = true;
    tick(new Date())
      .catch((err) => {
        logger.error("scheduler tick failed", { message: err instanceof Error ? err.message : String(err) });
      })
      .finally(() => {
        running = false;
      });
  });
  const j = getJitterMs();
  logger.info("scheduler started", { minJitterMs: j.min, maxJitterMs: j.max });
}
