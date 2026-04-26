import { logger } from "../lib/logger.js";

const VAR_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export interface TemplateContext {
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  job_title?: string | null;
  email?: string | null;
  sender_name?: string | null;
  custom?: Record<string, string> | null;
}

function resolve(key: string, ctx: TemplateContext): string | undefined {
  if (key.startsWith("custom.")) {
    const sub = key.slice("custom.".length);
    const custom = ctx.custom ?? {};
    return custom[sub] ?? undefined;
  }
  const direct = (ctx as Record<string, unknown>)[key];
  if (direct === undefined || direct === null) return undefined;
  return String(direct);
}

export function render(tpl: string, ctx: TemplateContext): string {
  return tpl.replace(VAR_RE, (_match, key: string) => {
    const val = resolve(key, ctx);
    if (val === undefined) {
      logger.warn("template variable missing", { key });
      return "";
    }
    return val;
  });
}
