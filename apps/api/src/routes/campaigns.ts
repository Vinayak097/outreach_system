import type { CampaignMetrics, ColumnMapping } from "@outreach/shared";
import { Router } from "express";
import { z } from "zod";
import { parseJson } from "../lib/json.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  name: z.string().min(1),
  smtpConfigId: z.coerce.number().int().positive(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  smtpConfigId: z.coerce.number().int().positive().optional(),
});

async function computeMetrics(campaignId: number): Promise<CampaignMetrics> {
  const grouped = await prisma.lead.groupBy({
    by: ["status"],
    where: { campaignId },
    _count: { _all: true },
  });
  const m: CampaignMetrics = {
    total: 0,
    pending: 0,
    sent: 0,
    opened: 0,
    clicked: 0,
    replied: 0,
    bounced: 0,
    failed: 0,
  };
  for (const g of grouped) {
    const count = g._count._all;
    m.total += count;
    if (g.status in m) (m as unknown as Record<string, number>)[g.status] = count;
  }
  return m;
}

function toDTO(c: {
  id: number;
  name: string;
  status: string;
  smtpConfigId: number;
  originalFileName: string | null;
  columnMapping: string | null;
  segmentColumn: string | null;
  createdAt: Date;
}) {
  return {
    id: c.id,
    name: c.name,
    status: c.status,
    smtpConfigId: c.smtpConfigId,
    originalFileName: c.originalFileName,
    columnMapping: c.columnMapping ? (parseJson<ColumnMapping | null>(c.columnMapping, null) ?? null) : null,
    segmentColumn: c.segmentColumn,
    createdAt: c.createdAt.toISOString(),
  };
}

router.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.campaign.findMany({ orderBy: { id: "desc" } });
    const withMetrics = await Promise.all(
      rows.map(async (r) => ({ ...toDTO(r), metrics: await computeMetrics(r.id) })),
    );
    res.json(withMetrics);
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const smtp = await prisma.smtpConfig.findUnique({ where: { id: input.smtpConfigId } });
    if (!smtp) throw new HttpError(400, "smtp_not_found");
    const row = await prisma.campaign.create({
      data: { name: input.name, smtpConfigId: input.smtpConfigId },
    });
    res.status(201).json(toDTO(row));
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const c = await prisma.campaign.findUnique({ where: { id } });
    if (!c) throw new HttpError(404, "campaign_not_found");
    const metrics = await computeMetrics(id);
    res.json({ ...toDTO(c), metrics });
  } catch (err) {
    next(err);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const input = updateSchema.parse(req.body);
    const row = await prisma.campaign.update({ where: { id }, data: input });
    res.json(toDTO(row));
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await prisma.campaign.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export { router as campaignsRouter };
