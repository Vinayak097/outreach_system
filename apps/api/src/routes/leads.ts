import { Router } from "express";
import { z } from "zod";
import { parseJson } from "../lib/json.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";

const router = Router();
router.use(requireAuth);

router.get("/:id", async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const lead = await prisma.lead.findUnique({
      where: { id },
      include: { sends: { include: { step: true, resolvedTemplate: true }, orderBy: { id: "asc" } } },
    });
    if (!lead) throw new HttpError(404, "lead_not_found");
    res.json({
      id: lead.id,
      campaignId: lead.campaignId,
      email: lead.email,
      firstName: lead.firstName,
      lastName: lead.lastName,
      company: lead.company,
      jobTitle: lead.jobTitle,
      customFields: parseJson<Record<string, string>>(lead.customFields, {}),
      sourceRowIndex: lead.sourceRowIndex,
      status: lead.status,
      currentStep: lead.currentStep,
      createdAt: lead.createdAt.toISOString(),
      timeline: lead.sends.map((s) => ({
        id: s.id,
        stepId: s.stepId,
        stepOrder: s.step.order,
        subject: s.resolvedTemplate?.subject ?? s.step.subjectTpl,
        resolvedTemplateId: s.resolvedTemplateId,
        resolvedTemplateName: s.resolvedTemplate?.name ?? null,
        trackingId: s.trackingId,
        scheduledFor: s.scheduledFor.toISOString(),
        sentAt: s.sentAt?.toISOString() ?? null,
        openedAt: s.openedAt?.toISOString() ?? null,
        clickedAt: s.clickedAt?.toISOString() ?? null,
        repliedAt: s.repliedAt?.toISOString() ?? null,
        bouncedAt: s.bouncedAt?.toISOString() ?? null,
        failedAt: s.failedAt?.toISOString() ?? null,
        errorMessage: s.errorMessage,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export { router as leadsRouter };
