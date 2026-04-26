import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";

const router = Router();
router.use(requireAuth);

const writeSchema = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
});

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
