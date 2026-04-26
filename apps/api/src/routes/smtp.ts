import { Router } from "express";
import nodemailer from "nodemailer";
import { z } from "zod";
import { decrypt, encrypt } from "../lib/crypto.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/error.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  name: z.string().min(1),
  host: z.string().min(1),
  port: z.coerce.number().int().positive().max(65535),
  secure: z.boolean().default(true),
  username: z.string().min(1),
  password: z.string().min(1),
  fromName: z.string().min(1),
  fromEmail: z.string().email(),
  imapHost: z.string().min(1).optional().nullable(),
  imapPort: z.coerce.number().int().positive().max(65535).optional().nullable(),
  imapUser: z.string().min(1).optional().nullable(),
  imapPass: z.string().min(1).optional().nullable(),
  dailyLimit: z.coerce.number().int().positive().max(10000).default(50),
});

const updateSchema = createSchema.partial().extend({
  password: z.string().min(1).optional(),
  imapPass: z.string().min(1).optional().nullable(),
});

const testSchema = z.object({
  to: z.string().email(),
});

function toDTO(row: {
  id: number;
  name: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromName: string;
  fromEmail: string;
  imapHost: string | null;
  imapPort: number | null;
  imapUser: string | null;
  dailyLimit: number;
  createdAt: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    secure: row.secure,
    username: row.username,
    fromName: row.fromName,
    fromEmail: row.fromEmail,
    imapHost: row.imapHost,
    imapPort: row.imapPort,
    imapUser: row.imapUser,
    dailyLimit: row.dailyLimit,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.smtpConfig.findMany({ orderBy: { id: "asc" } });
    res.json(rows.map(toDTO));
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const encryptedPassword = encrypt(input.password);
    const row = await prisma.smtpConfig.create({
      data: {
        name: input.name,
        host: input.host,
        port: input.port,
        secure: input.secure,
        username: input.username,
        password: encryptedPassword,
        fromName: input.fromName,
        fromEmail: input.fromEmail,
        imapHost: input.imapHost ?? null,
        imapPort: input.imapPort ?? null,
        imapUser: input.imapUser ?? null,
        imapPass: input.imapHost
          ? input.imapPass
            ? encrypt(input.imapPass)
            : encryptedPassword
          : null,
        dailyLimit: input.dailyLimit,
      },
    });
    res.status(201).json(toDTO(row));
  } catch (err) {
    next(err);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const input = updateSchema.parse(req.body);
    const existing = await prisma.smtpConfig.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "smtp_not_found");
    const row = await prisma.smtpConfig.update({
      where: { id },
      data: {
        name: input.name ?? existing.name,
        host: input.host ?? existing.host,
        port: input.port ?? existing.port,
        secure: input.secure ?? existing.secure,
        username: input.username ?? existing.username,
        password: input.password ? encrypt(input.password) : existing.password,
        fromName: input.fromName ?? existing.fromName,
        fromEmail: input.fromEmail ?? existing.fromEmail,
        imapHost: input.imapHost === undefined ? existing.imapHost : input.imapHost,
        imapPort: input.imapPort === undefined ? existing.imapPort : input.imapPort,
        imapUser: input.imapUser === undefined ? existing.imapUser : input.imapUser,
        imapPass:
          input.imapPass === undefined
            ? existing.imapPass
            : input.imapPass === null
              ? null
              : encrypt(input.imapPass),
        dailyLimit: input.dailyLimit ?? existing.dailyLimit,
      },
    });
    res.json(toDTO(row));
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const linked = await prisma.campaign.count({ where: { smtpConfigId: id } });
    if (linked > 0) throw new HttpError(409, "smtp_in_use", { campaigns: linked });
    await prisma.smtpConfig.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/test", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { to } = testSchema.parse(req.body);
    const cfg = await prisma.smtpConfig.findUnique({ where: { id } });
    if (!cfg) throw new HttpError(404, "smtp_not_found");

    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.username, pass: decrypt(cfg.password) },
    });

    try {
      const info = await transporter.sendMail({
        from: { name: cfg.fromName, address: cfg.fromEmail },
        to,
        subject: `Outreach test email — ${cfg.name}`,
        text: `This is a test email sent from your "${cfg.name}" SMTP configuration.`,
        html: `<p>This is a test email sent from your <strong>${cfg.name}</strong> SMTP configuration.</p>`,
      });
      logger.info("smtp test sent", { smtpId: id, to, messageId: info.messageId });
      res.json({ ok: true, messageId: info.messageId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn("smtp test failed", { smtpId: id, to, message });
      res.status(400).json({ error: "smtp_send_failed", details: { message } });
    } finally {
      transporter.close();
    }
  } catch (err) {
    next(err);
  }
});

export { router as smtpRouter };
