import type { ColumnMapping } from "@outreach/shared";
import ExcelJS from "exceljs";
import type { Response } from "express";
import { parseJson } from "../lib/json.js";
import { prisma } from "../lib/prisma.js";

const EXTRA_COLUMNS = [
  "outreach_status",
  "outreach_current_step",
  "outreach_first_sent_at",
  "outreach_last_sent_at",
  "outreach_opened_at",
  "outreach_clicked_at",
  "outreach_replied_at",
  "outreach_bounced_at",
] as const;

export async function exportCampaign(campaignId: number, res: Response): Promise<void> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) {
    res.status(404).json({ error: "campaign_not_found" });
    return;
  }
  const mapping = parseJson<ColumnMapping | null>(campaign.columnMapping, null);
  const originalHeaders = parseJson<string[]>(campaign.originalHeaders, []);

  const leads = await prisma.lead.findMany({
    where: { campaignId },
    orderBy: { sourceRowIndex: "asc" },
    include: { sends: { orderBy: { id: "asc" } } },
  });

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Leads");

  const headers =
    originalHeaders.length > 0
      ? originalHeaders
      : mapping
        ? buildFallbackHeaders(mapping)
        : ["email", "first_name", "last_name", "company", "job_title"];

  sheet.addRow([...headers, ...EXTRA_COLUMNS]);

  for (const l of leads) {
    const raw = parseJson<Record<string, string>>(l.rawRow, {});
    const sents = l.sends.filter((s) => s.sentAt);
    const firstSent = sents[0]?.sentAt ?? null;
    const lastSent = sents[sents.length - 1]?.sentAt ?? null;
    const opened = l.sends.find((s) => s.openedAt)?.openedAt ?? null;
    const clicked = l.sends.find((s) => s.clickedAt)?.clickedAt ?? null;
    const replied = l.sends.find((s) => s.repliedAt)?.repliedAt ?? null;
    const bounced = l.sends.find((s) => s.bouncedAt)?.bouncedAt ?? null;
    const wasSent = sents.length > 0;
    const wasReplied = l.status === "replied" || replied !== null;

    const row: (string | number | null)[] = [];
    for (const h of headers) {
      if (mapping?.replyStatus === h) {
        row.push(wasReplied ? "yes" : "");
        continue;
      }
      if (mapping?.emailSentStatus === h) {
        row.push(wasSent ? "yes" : "");
        continue;
      }
      if (raw[h] !== undefined) {
        row.push(raw[h] ?? "");
        continue;
      }
      if (!mapping) {
        if (h === "email") row.push(l.email);
        else if (h === "first_name") row.push(l.firstName ?? "");
        else if (h === "last_name") row.push(l.lastName ?? "");
        else if (h === "company") row.push(l.company ?? "");
        else if (h === "job_title") row.push(l.jobTitle ?? "");
        else row.push("");
        continue;
      }
      row.push("");
    }

    row.push(
      l.status,
      l.currentStep || "",
      firstSent ? fmtDate(firstSent) : "",
      lastSent ? fmtDate(lastSent) : "",
      opened ? fmtDate(opened) : "",
      clicked ? fmtDate(clicked) : "",
      replied ? fmtDate(replied) : "",
      bounced ? fmtDate(bounced) : "",
    );
    sheet.addRow(row);
  }

  const safeName = (campaign.name || "campaign").replace(/[^a-z0-9_-]+/gi, "_");
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}-${campaignId}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}

function fmtDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function buildFallbackHeaders(mapping: ColumnMapping): string[] {
  const hs: string[] = [];
  if (mapping.email) hs.push(mapping.email);
  for (const k of ["firstName", "lastName", "company", "jobTitle", "replyStatus", "emailSentStatus"] as const) {
    const v = mapping[k];
    if (v && !hs.includes(v)) hs.push(v);
  }
  for (const c of mapping.custom) if (!hs.includes(c)) hs.push(c);
  return hs;
}
