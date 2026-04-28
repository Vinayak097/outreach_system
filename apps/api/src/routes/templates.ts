import { Router } from "express";
import nodemailer from "nodemailer";
import { z } from "zod";
import { decrypt } from "../lib/crypto.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import { textToHtml } from "../services/tracking.js";
import { render } from "../services/templating.js";

const router = Router();
router.use(requireAuth);

const writeSchema = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
});

const testSchema = z.object({
  smtpConfigId: z.coerce.number().int().positive(),
  to: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
});

const sampleContext = {
  first_name: "Alex",
  last_name: "Johnson",
  company: "Acme Labs",
  job_title: "Growth Lead",
  email: "alex.johnson@example.com",
  sender_name: "Morgan",
  custom: {
    plan: "Pro",
    industry: "SaaS",
    city: "Bengaluru",
  },
};

function bodyToHtml(text: string): string {
  if (/<\w+[\s>]/.test(text)) return text;
  return textToHtml(text);
}

function bodyToText(rendered: string): string {
  return rendered
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function toDTO(t: {
  id: number;
  name: string;
  subject: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: t.id,
    name: t.name,
    subject: t.subject,
    body: t.body,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

router.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.template.findMany({ orderBy: { updatedAt: "desc" } });
    res.json(rows.map(toDTO));
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const input = writeSchema.parse(req.body);
    const row = await prisma.template.create({ data: input });
    res.status(201).json(toDTO(row));
  } catch (err) {
    next(err);
  }
});

router.post("/test", async (req, res, next) => {
  try {
    const input = testSchema.parse(req.body);
    const cfg = await prisma.smtpConfig.findUnique({ where: { id: input.smtpConfigId } });
    if (!cfg) throw new HttpError(404, "smtp_not_found");

    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.username, pass: decrypt(cfg.password) },
    });

    const renderedSubject = render(input.subject, sampleContext);
    const renderedBody = render(input.body, sampleContext);
    const html = bodyToHtml(renderedBody);
    const text = bodyToText(html);

    try {
      const info = await transporter.sendMail({
        from: { name: cfg.fromName, address: cfg.fromEmail },
        to: input.to,
        subject: `[Template Test] ${renderedSubject}`,
        html,
        text,
      });
      logger.info("template test sent", {
        smtpId: cfg.id,
        to: input.to,
        messageId: info.messageId,
      });
      res.json({ ok: true, messageId: info.messageId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn("template test failed", { smtpId: cfg.id, to: input.to, message });
      res.status(400).json({ error: "template_test_failed", details: { message } });
    } finally {
      transporter.close();
    }
  } catch (err) {
    next(err);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const input = writeSchema.partial().parse(req.body);
    const existing = await prisma.template.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "template_not_found");
    const row = await prisma.template.update({ where: { id }, data: input });
    res.json(toDTO(row));
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await prisma.template.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export { router as templatesRouter };
