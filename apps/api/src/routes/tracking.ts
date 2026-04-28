import { Router } from "express";
import { z } from "zod";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

router.get("/test", (_req, res) => {
  res.json({
    ok: true,
    trackingBaseUrl: config.TRACKING_BASE_URL,
    samplePixel: `${config.TRACKING_BASE_URL}/t/open/TEST_ID`,
  });
});

const GIF_1PX = Buffer.from(
  "R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
  "base64",
);

router.get("/open/:trackingId", async (req, res) => {
  const trackingId = String(req.params.trackingId ?? "");
  let found = false;
  let alreadyOpened = false;
  try {
    const send = await prisma.emailSend.findUnique({ where: { trackingId } });
    found = Boolean(send);
    alreadyOpened = Boolean(send?.openedAt);
    if (send && !send.openedAt) {
      await prisma.emailSend.update({
        where: { id: send.id },
        data: { openedAt: new Date() },
      });
      if (send.leadId) {
        const lead = await prisma.lead.findUnique({ where: { id: send.leadId } });
        if (lead && lead.status === "sent") {
          await prisma.lead.update({ where: { id: send.leadId }, data: { status: "opened" } });
        }
      }
    }
  } catch {
    // Tracking should never fail loudly for email clients.
  }
  logger.info("tracking open", {
    trackingId,
    found,
    alreadyOpened,
    ua: req.get("user-agent") ?? null,
    forwardedFor: req.get("x-forwarded-for") ?? null,
  });
  res.set("Content-Type", "image/gif");
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.end(GIF_1PX);
});

const clickQuery = z.object({ url: z.string().min(1) });

router.get("/click/:trackingId", async (req, res) => {
  const trackingId = String(req.params.trackingId ?? "");
  const parsed = clickQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).send("missing url");

  const target = parsed.data.url;
  if (!/^https?:\/\//i.test(target)) return res.status(400).send("invalid url");

  let found = false;
  let alreadyClicked = false;
  try {
    const send = await prisma.emailSend.findUnique({ where: { trackingId } });
    found = Boolean(send);
    alreadyClicked = Boolean(send?.clickedAt);
    if (send) {
      if (!send.clickedAt) {
        await prisma.emailSend.update({
          where: { id: send.id },
          data: { clickedAt: new Date(), openedAt: send.openedAt ?? new Date() },
        });
      }
      if (send.leadId) {
        const lead = await prisma.lead.findUnique({ where: { id: send.leadId } });
        if (lead && (lead.status === "sent" || lead.status === "opened")) {
          await prisma.lead.update({ where: { id: send.leadId }, data: { status: "clicked" } });
        }
      }
    }
  } catch {
    // Ignore tracking persistence failures and keep redirecting.
  }
  logger.info("tracking click", {
    trackingId,
    found,
    alreadyClicked,
    target,
    ua: req.get("user-agent") ?? null,
    forwardedFor: req.get("x-forwarded-for") ?? null,
  });
  res.redirect(302, target);
});

export { router as trackingRouter };
