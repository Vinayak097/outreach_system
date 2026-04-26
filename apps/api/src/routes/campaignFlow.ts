import type { ColumnMapping } from "@outreach/shared";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { parseJson } from "../lib/json.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import { parseWorkbook, planImport, toPreview, validateMapping } from "../services/excel.js";
import { exportCampaign } from "../services/export.js";

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const uploadCache = new Map<number, { headers: string[]; buffer: Buffer; fileName: string }>();

const mappingSchema = z.object({
  email: z.string().min(1),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  replyStatus: z.string().optional(),
  emailSentStatus: z.string().optional(),
  segmentColumn: z.string().optional(),
  custom: z.array(z.string()).default([]),
}) satisfies z.ZodType<ColumnMapping, z.ZodTypeDef, unknown>;

const stepSchema = z.object({
  order: z.coerce.number().int().nonnegative(),
  subjectTpl: z.string().default(""),
  bodyTpl: z.string().default(""),
  delayDays: z.coerce.number().int().nonnegative().default(0),
  defaultTemplateId: z.coerce.number().int().positive().nullable().optional(),
});

async function requireCampaign(id: number) {
  const c = await prisma.campaign.findUnique({ where: { id } });
  if (!c) throw new HttpError(404, "campaign_not_found");
  return c;
}

router.post("/:id/upload", upload.single("file"), async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await requireCampaign(id);
    if (!req.file) throw new HttpError(400, "file_missing");
    const parsed = await parseWorkbook(req.file.buffer);
    if (parsed.headers.length === 0) throw new HttpError(400, "empty_sheet");
    uploadCache.set(id, { headers: parsed.headers, buffer: req.file.buffer, fileName: req.file.originalname });
    await prisma.campaign.update({
      where: { id },
      data: { originalFileName: req.file.originalname },
    });
    res.json(toPreview(parsed));
  } catch (err) {
    next(err);
  }
});

router.post("/:id/import", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { mapping } = z.object({ mapping: mappingSchema }).parse(req.body);
    const campaign = await requireCampaign(id);
    if (campaign.status !== "draft") throw new HttpError(400, "campaign_not_draft");

    const cached = uploadCache.get(id);
    if (!cached) throw new HttpError(400, "no_upload_found");

    const validation = validateMapping(mapping, cached.headers);
    if (!validation.ok) throw new HttpError(400, "invalid_mapping", { message: validation.error });
    if (mapping.segmentColumn && !cached.headers.includes(mapping.segmentColumn)) {
      throw new HttpError(400, "invalid_mapping", {
        message: `segment column "${mapping.segmentColumn}" not in sheet`,
      });
    }

    const parsed = await parseWorkbook(cached.buffer);
    const outcome = planImport(parsed, mapping);

    await prisma.$transaction(async (tx) => {
      await tx.lead.deleteMany({ where: { campaignId: id } });
      if (outcome.leads.length > 0) {
        await tx.lead.createMany({
          data: outcome.leads.map((l) => ({ ...l, campaignId: id })),
        });
      }
      await tx.campaign.update({
        where: { id },
        data: {
          columnMapping: JSON.stringify(mapping),
          originalHeaders: JSON.stringify(cached.headers),
          segmentColumn: mapping.segmentColumn || null,
        },
      });
    });

    res.json({
      imported: outcome.imported,
      skipped: outcome.skipped,
      preReplied: outcome.preReplied,
      skipReasons: outcome.skipReasons.slice(0, 20),
      parsedHeaders: cached.headers,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/steps", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await requireCampaign(id);
    const steps = await prisma.sequenceStep.findMany({
      where: { campaignId: id },
      orderBy: { order: "asc" },
    });
    res.json(
      steps.map((s) => ({
        id: s.id,
        order: s.order,
        subjectTpl: s.subjectTpl,
        bodyTpl: s.bodyTpl,
        delayDays: s.delayDays,
        defaultTemplateId: s.defaultTemplateId,
      })),
    );
  } catch (err) {
    next(err);
  }
});

router.put("/:id/steps", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { steps } = z.object({ steps: z.array(stepSchema).min(1) }).parse(req.body);
    const campaign = await requireCampaign(id);
    if (campaign.status !== "draft") throw new HttpError(400, "campaign_not_draft");

    const normalized = [...steps]
      .sort((a, b) => a.order - b.order)
      .map((s, idx) => ({ ...s, order: idx + 1 }));

    const templateIds = normalized
      .map((s) => s.defaultTemplateId)
      .filter((x): x is number => typeof x === "number");
    if (templateIds.length > 0) {
      const found = await prisma.template.count({ where: { id: { in: templateIds } } });
      if (found !== new Set(templateIds).size) {
        throw new HttpError(400, "default_template_not_found");
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.sequenceStep.deleteMany({ where: { campaignId: id } });
      for (const s of normalized) {
        await tx.sequenceStep.create({
          data: {
            campaignId: id,
            order: s.order,
            subjectTpl: s.subjectTpl ?? "",
            bodyTpl: s.bodyTpl ?? "",
            delayDays: s.delayDays,
            defaultTemplateId: s.defaultTemplateId ?? null,
          },
        });
      }
    });

    const saved = await prisma.sequenceStep.findMany({
      where: { campaignId: id },
      orderBy: { order: "asc" },
    });
    res.json(
      saved.map((s) => ({
        id: s.id,
        order: s.order,
        subjectTpl: s.subjectTpl,
        bodyTpl: s.bodyTpl,
        delayDays: s.delayDays,
        defaultTemplateId: s.defaultTemplateId,
      })),
    );
  } catch (err) {
    next(err);
  }
});

router.post("/:id/launch", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const campaign = await requireCampaign(id);
    if (campaign.status === "active") return res.json({ ok: true, status: "active" });
    if (campaign.status === "completed") throw new HttpError(400, "already_completed");

    const steps = await prisma.sequenceStep.findMany({
      where: { campaignId: id },
      orderBy: { order: "asc" },
    });
    if (steps.length === 0) throw new HttpError(400, "no_steps");
    const hasSegmentColumn = Boolean(campaign.segmentColumn);
    for (const s of steps) {
      const hasDefault = s.defaultTemplateId !== null && s.defaultTemplateId !== undefined;
      const hasInlineText = s.subjectTpl.trim().length > 0 && s.bodyTpl.trim().length > 0;
      if (!hasDefault && !hasInlineText && !hasSegmentColumn) {
        throw new HttpError(400, "empty_step_template", { stepOrder: s.order });
      }
    }

    const pendingLeads = await prisma.lead.findMany({
      where: { campaignId: id, status: "pending" },
      select: { id: true },
    });
    if (pendingLeads.length === 0) throw new HttpError(400, "no_pending_leads");

    const firstStep = steps[0]!;
    const now = new Date();

    const existingSendLeadIds = new Set(
      (
        await prisma.emailSend.findMany({
          where: { stepId: firstStep.id, leadId: { in: pendingLeads.map((l) => l.id) } },
          select: { leadId: true },
        })
      ).map((r) => r.leadId),
    );

    const newSends = pendingLeads
      .filter((l) => !existingSendLeadIds.has(l.id))
      .map((l) => ({
        leadId: l.id,
        stepId: firstStep.id,
        trackingId: randomUUID(),
        scheduledFor: now,
      }));

    if (newSends.length > 0) {
      await prisma.emailSend.createMany({ data: newSends });
    }
    await prisma.campaign.update({ where: { id }, data: { status: "active" } });
    logger.info("campaign launched", { campaignId: id, enqueued: newSends.length });
    res.json({ ok: true, status: "active", enqueued: newSends.length });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/pause", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await requireCampaign(id);
    await prisma.campaign.update({ where: { id }, data: { status: "paused" } });
    res.json({ ok: true, status: "paused" });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/resume", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await requireCampaign(id);
    await prisma.campaign.update({ where: { id }, data: { status: "active" } });
    res.json({ ok: true, status: "active" });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/leads", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const pageSchema = z.object({
      status: z.string().optional(),
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(200).default(50),
    });
    const { status, page, pageSize } = pageSchema.parse(req.query);
    await requireCampaign(id);
    const where = { campaignId: id, ...(status ? { status } : {}) };
    const [total, rows] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        orderBy: { sourceRowIndex: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const leadIds = rows.map((l) => l.id);
    const lastSends = leadIds.length > 0
      ? await prisma.emailSend.findMany({
          where: { leadId: { in: leadIds }, resolvedTemplateId: { not: null } },
          include: { resolvedTemplate: { select: { name: true } } },
          orderBy: { id: "desc" },
          distinct: ["leadId"],
        })
      : [];
    const lastTemplateByLead = new Map(lastSends.map((s) => [s.leadId, s.resolvedTemplate?.name ?? null]));

    res.json({
      total,
      page,
      pageSize,
      rows: rows.map((l) => ({
        id: l.id,
        campaignId: l.campaignId,
        email: l.email,
        firstName: l.firstName,
        lastName: l.lastName,
        company: l.company,
        jobTitle: l.jobTitle,
        customFields: parseJson<Record<string, string>>(l.customFields, {}),
        sourceRowIndex: l.sourceRowIndex,
        status: l.status,
        currentStep: l.currentStep,
        createdAt: l.createdAt.toISOString(),
        lastTemplateName: lastTemplateByLead.get(l.id) ?? null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/segments", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const campaign = await requireCampaign(id);
    const savedColumn = campaign.segmentColumn ?? null;
    const previewColumn = typeof req.query.column === "string" ? req.query.column : null;
    const activeColumn = previewColumn ?? savedColumn;

    const leads = await prisma.lead.findMany({
      where: { campaignId: id },
      select: { rawRow: true },
    });

    const counts = new Map<string, number>();
    if (activeColumn) {
      for (const l of leads) {
        const raw = parseJson<Record<string, string>>(l.rawRow, {});
        const v = (raw[activeColumn] ?? "").trim();
        if (!v) continue;
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
    }

    const steps = await prisma.sequenceStep.findMany({
      where: { campaignId: id },
      orderBy: { order: "asc" },
      include: { rules: true },
    });

    res.json({
      segmentColumn: savedColumn,
      previewColumn,
      headers: parseJson<string[]>(campaign.originalHeaders, []),
      uniqueValues: [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([value, count]) => ({ value, count })),
      steps: steps.map((s) => ({
        id: s.id,
        order: s.order,
        rules: s.rules.map((r) => ({
          segmentValue: r.segmentValue,
          templateId: r.templateId,
        })),
      })),
    });
  } catch (err) {
    next(err);
  }
});

const segmentsSchema = z.object({
  segmentColumn: z.string().nullable(),
  rules: z.array(
    z.object({
      stepId: z.coerce.number().int().positive(),
      segmentValue: z.string().min(1),
      templateId: z.coerce.number().int().positive(),
    }),
  ),
});

router.put("/:id/segments", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const input = segmentsSchema.parse(req.body);
    const campaign = await requireCampaign(id);

    const steps = await prisma.sequenceStep.findMany({
      where: { campaignId: id },
      select: { id: true },
    });
    const stepIds = new Set(steps.map((s) => s.id));
    for (const r of input.rules) {
      if (!stepIds.has(r.stepId)) {
        throw new HttpError(400, "rule_step_not_in_campaign", { stepId: r.stepId });
      }
    }

    if (input.rules.length > 0) {
      const templateIds = [...new Set(input.rules.map((r) => r.templateId))];
      const found = await prisma.template.count({ where: { id: { in: templateIds } } });
      if (found !== templateIds.length) throw new HttpError(400, "template_not_found");
    }

    await prisma.$transaction(async (tx) => {
      await tx.stepSegmentRule.deleteMany({
        where: { step: { campaignId: id } },
      });
      await tx.campaign.update({
        where: { id },
        data: { segmentColumn: input.segmentColumn ?? null },
      });
      if (input.rules.length > 0) {
        await tx.stepSegmentRule.createMany({
          data: input.rules.map((r) => ({
            stepId: r.stepId,
            segmentValue: r.segmentValue,
            templateId: r.templateId,
          })),
        });
      }
    });

    logger.info("segments updated", {
      campaignId: id,
      column: input.segmentColumn,
      ruleCount: input.rules.length,
    });
    res.json({ ok: true, segmentColumn: input.segmentColumn, rules: input.rules });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/export", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await requireCampaign(id);
    await exportCampaign(id, res);
  } catch (err) {
    next(err);
  }
});

export { router as campaignFlowRouter };
