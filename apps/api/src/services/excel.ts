import type { ColumnMapping, UploadPreview } from "@outreach/shared";
import ExcelJS from "exceljs";
import { logger } from "../lib/logger.js";

export interface ParsedRow {
  index: number;
  values: Record<string, string>;
}

export interface ParsedWorkbook {
  headers: string[];
  rows: ParsedRow[];
}

export async function parseWorkbook(buffer: Buffer): Promise<ParsedWorkbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = wb.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };

  const headerRow = sheet.getRow(1);
  const headerCells: Array<{ col: number; name: string }> = [];
  const seen = new Map<string, number>();
  headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
    const raw = cellToString(cell.value).trim();
    if (!raw) return;
    const count = seen.get(raw) ?? 0;
    const name = count === 0 ? raw : `${raw} (${count + 1})`;
    seen.set(raw, count + 1);
    headerCells.push({ col, name });
  });
  const headers = headerCells.map((h) => h.name);

  const rows: ParsedRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const values: Record<string, string> = {};
    for (const h of headerCells) {
      values[h.name] = cellToString(row.getCell(h.col).value).trim();
    }
    rows.push({ index: rowNumber - 2, values });
  });

  return { headers, rows };
}

export function toPreview(parsed: ParsedWorkbook, sampleSize = 5): UploadPreview {
  return {
    headers: parsed.headers,
    sampleRows: parsed.rows.slice(0, sampleSize).map((r) => r.values),
    totalRows: parsed.rows.length,
  };
}

function cellToString(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number") return String(val);
  if (typeof val === "boolean") return val ? "true" : "false";
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "object") {
    const v = val as { text?: unknown; hyperlink?: unknown; richText?: Array<{ text: string }>; result?: unknown };
    if (Array.isArray(v.richText)) return v.richText.map((rt) => rt.text).join("");
    if (typeof v.text === "string") return v.text;
    if (typeof v.hyperlink === "string") return v.hyperlink;
    if (v.result !== undefined) return cellToString(v.result);
  }
  return String(val);
}

const RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(s: string): boolean {
  return RE.test(s);
}

const REPLIED_VALUES = new Set(["yes", "true", "1", "replied", "y"]);
export function isReplied(raw: string): boolean {
  return REPLIED_VALUES.has(raw.trim().toLowerCase());
}

export interface ImportOutcome {
  imported: number;
  skipped: number;
  preReplied: number;
  skipReasons: Array<{ row: number; reason: string; rawEmail: string }>;
  leads: Array<{
    email: string;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    jobTitle: string | null;
    customFields: string;
    rawRow: string;
    sourceRowIndex: number;
    status: "pending" | "replied";
  }>;
}

export function planImport(parsed: ParsedWorkbook, mapping: ColumnMapping): ImportOutcome {
  const out: ImportOutcome = { imported: 0, skipped: 0, preReplied: 0, skipReasons: [], leads: [] };
  for (const row of parsed.rows) {
    const rawEmail = (row.values[mapping.email] ?? "").trim();
    if (!rawEmail) {
      out.skipped++;
      out.skipReasons.push({ row: row.index + 2, reason: "email column is blank", rawEmail });
      continue;
    }
    if (!isValidEmail(rawEmail)) {
      out.skipped++;
      out.skipReasons.push({ row: row.index + 2, reason: "not a valid email address", rawEmail });
      continue;
    }
    const email = rawEmail;
    const firstName = mapping.firstName ? row.values[mapping.firstName] ?? null : null;
    const lastName = mapping.lastName ? row.values[mapping.lastName] ?? null : null;
    const company = mapping.company ? row.values[mapping.company] ?? null : null;
    const jobTitle = mapping.jobTitle ? row.values[mapping.jobTitle] ?? null : null;

    const custom: Record<string, string> = {};
    for (const key of mapping.custom) {
      custom[slug(key)] = row.values[key] ?? "";
    }

    let status: "pending" | "replied" = "pending";
    if (mapping.replyStatus) {
      const raw = row.values[mapping.replyStatus] ?? "";
      if (isReplied(raw)) {
        status = "replied";
        out.preReplied++;
      }
    }

    out.imported++;
    out.leads.push({
      email,
      firstName: firstName || null,
      lastName: lastName || null,
      company: company || null,
      jobTitle: jobTitle || null,
      customFields: JSON.stringify(custom),
      rawRow: JSON.stringify(row.values),
      sourceRowIndex: row.index,
      status,
    });
  }
  logger.info("import planned", {
    imported: out.imported,
    skipped: out.skipped,
    preReplied: out.preReplied,
  });
  return out;
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function validateMapping(
  mapping: ColumnMapping,
  headers: string[],
): { ok: true } | { ok: false; error: string } {
  if (!mapping.email) return { ok: false, error: "email column is required" };
  if (!headers.includes(mapping.email)) return { ok: false, error: `email column "${mapping.email}" not in sheet` };
  const optional: Array<keyof ColumnMapping> = [
    "firstName",
    "lastName",
    "company",
    "jobTitle",
    "replyStatus",
    "emailSentStatus",
  ];
  for (const k of optional) {
    const v = mapping[k];
    if (v && typeof v === "string" && !headers.includes(v)) {
      return { ok: false, error: `column "${v}" mapped to ${k} is not in the sheet` };
    }
  }
  for (const c of mapping.custom) {
    if (!headers.includes(c)) return { ok: false, error: `custom column "${c}" not in sheet` };
  }
  return { ok: true };
}
