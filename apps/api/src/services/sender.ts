import { randomUUID } from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer";
import { decrypt } from "../lib/crypto.js";
import { parseJson } from "../lib/json.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import { injectPixel, looksLikeHardBounce, rewriteLinks, textToHtml } from "./tracking.js";
import { render, type TemplateContext } from "./templating.js";

export type SendOutcome =
  | { kind: "sent"; messageId: string | null }
  | { kind: "skipped"; reason: string }
  | { kind: "failed"; message: string; hardBounce: boolean };

function buildContext(
  lead: {
    email: string;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    jobTitle: string | null;
    customFields: string;
  },
  senderName: string,
): TemplateContext {
  return {
    first_name: lead.firstName,
    last_name: lead.lastName,
    company: lead.company,
    job_title: lead.jobTitle,
    email: lead.email,
    sender_name: senderName,
    custom: parseJson<Record<string, string>>(lead.customFields, {}),
  };
}

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

async function resolveTemplateText(
  stepId: number,
  stepSubjectTpl: string,
  stepBodyTpl: string,
  defaultTemplateId: number | null,
  segmentColumn: string | null,
  leadRawRow: string,
): Promise<{ subject: string; body: string; via: string; templateId: number | null }> {
  if (segmentColumn) {
    const raw = parseJson<Record<string, string>>(leadRawRow, {});
    const leadVal = (raw[segmentColumn] ?? "").trim();
    if (leadVal) {
      const rule = await prisma.stepSegmentRule.findUnique({
        where: { stepId_segmentValue: { stepId, segmentValue: leadVal } },
        include: { template: true },
      });
      if (rule) {
        return {
          subject: rule.template.subject,
          body: rule.template.body,
          via: `segment_rule_template_${rule.templateId}`,
          templateId: rule.templateId,
        };
      }
    }
  }
  if (defaultTemplateId) {
    const tpl = await prisma.template.findUnique({ where: { id: defaultTemplateId } });
    if (tpl) {
      return { subject: tpl.subject, body: tpl.body, via: `default_template_${tpl.id}`, templateId: tpl.id };
    }
  }
  return { subject: stepSubjectTpl, body: stepBodyTpl, via: "step_inline", templateId: null };
}

export async function sendOne(sendId: number): Promise<SendOutcome> {
  const send = await prisma.emailSend.findUnique({
    where: { id: sendId },
    include: {
      lead: true,
      step: { include: { campaign: { include: { smtpConfig: true } } } },
    },
  });
  if (!send) return { kind: "skipped", reason: "send_not_found" };
  if (send.sentAt) return { kind: "skipped", reason: "already_sent" };
  if (send.step.campaign.status !== "active") {
    return { kind: "skipped", reason: "campaign_not_active" };
  }
  if (send.lead.status === "replied" || send.lead.status === "bounced") {
    await prisma.emailSend.update({
      where: { id: sendId },
      data: { failedAt: new Date(), errorMessage: `lead ${send.lead.status}` },
    });
    return { kind: "skipped", reason: `lead_${send.lead.status}` };
  }

  const smtp = send.step.campaign.smtpConfig;
  const ctx = buildContext(send.lead, smtp.fromName);
  const resolved = await resolveTemplateText(
    send.step.id,
    send.step.subjectTpl,
    send.step.bodyTpl,
    send.step.defaultTemplateId,
    send.step.campaign.segmentColumn,
    send.lead.rawRow,
  );
  const subject = render(resolved.subject, ctx);
  const rawBody = render(resolved.body, ctx);
  const html = injectPixel(rewriteLinks(bodyToHtml(rawBody), send.trackingId), send.trackingId);
  const text = bodyToText(html);
  const messageId = `<${randomUUID()}@outreach.local>`;

  const transporter: Transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.username, pass: decrypt(smtp.password) },
  });

  try {
    const info = await transporter.sendMail({
      from: { name: smtp.fromName, address: smtp.fromEmail },
      to: send.lead.email,
      subject,
      html,
      text,
      messageId,
    });
    const now = new Date();
    const finalId = info.messageId ?? messageId;
    await prisma.$transaction([
      prisma.emailSend.update({
        where: { id: sendId },
        data: { sentAt: now, messageId: finalId, resolvedTemplateId: resolved.templateId },
      }),
      prisma.lead.update({
        where: { id: send.leadId },
        data: { status: "sent", currentStep: send.step.order },
      }),
    ]);

    const nextStep = await prisma.sequenceStep.findFirst({
      where: { campaignId: send.step.campaignId, order: { gt: send.step.order } },
      orderBy: { order: "asc" },
    });
    if (nextStep) {
      const scheduledFor = new Date(now.getTime() + nextStep.delayDays * 24 * 60 * 60 * 1000);
      await prisma.emailSend.create({
        data: {
          leadId: send.leadId,
          stepId: nextStep.id,
          trackingId: randomUUID(),
          scheduledFor,
        },
      });
    }
    logger.info("email sent", {
      sendId,
      to: send.lead.email,
      step: send.step.order,
      via: resolved.via,
    });
    return { kind: "sent", messageId: finalId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const hardBounce = looksLikeHardBounce(message);
    const now = new Date();
    await prisma.emailSend.update({
      where: { id: sendId },
      data: { failedAt: now, errorMessage: message, bouncedAt: hardBounce ? now : null },
    });
    if (hardBounce) {
      await prisma.lead.update({
        where: { id: send.leadId },
        data: { status: "bounced" },
      });
    }
    logger.warn("email send failed", { sendId, hardBounce, message });
    return { kind: "failed", message, hardBounce };
  } finally {
    transporter.close();
  }
}
