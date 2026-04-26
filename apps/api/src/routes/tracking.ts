import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

const router = Router();

const GIF_1PX = Buffer.from(
  "R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
  "base64",
);

router.get("/open/:trackingId", async (req, res) => {
  const trackingId = String(req.params.trackingId ?? "");
  try {
    const send = await prisma.emailSend.findUnique({ where: { trackingId } });
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
    // swallow — tracking must never fail loudly
  }
  res.set("Content-Type", "image/gif");
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  res.end(GIF_1PX);
});

const clickQuery = z.object({ url: z.string().min(1) });

router.get("/click/:trackingId", async (req, res) => {
  const trackingId = String(req.params.trackingId ?? "");
  const parsed = clickQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).send("missing url");

  const target = parsed.data.url;
  if (!/^https?:\/\//i.test(target)) return res.status(400).send("invalid url");

  try {
    const send = await prisma.emailSend.findUnique({ where: { trackingId } });
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
    // ignore
  }
  res.redirect(302, target);
});

export { router as trackingRouter };
