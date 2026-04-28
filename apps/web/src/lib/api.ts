import type {
  CampaignDTO,
  ColumnMapping,
  ImportResult,
  LeadDetail,
  LeadDTO,
  SequenceStepDTO,
  SmtpConfigDTO,
  TemplateDTO,
  UploadPreview,
} from "@outreach/shared";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") ?? "";
  const body: unknown = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const err = body as { error?: string; details?: unknown };
    throw new ApiError(res.status, err.error ?? "request_failed", err.details);
  }
  return body as T;
}

async function uploadFile<T>(path: string, file: File): Promise<T> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(BASE + path, {
    credentials: "include",
    method: "POST",
    body: fd,
  });
  const ct = res.headers.get("content-type") ?? "";
  const body: unknown = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const err = body as { error?: string; details?: unknown };
    throw new ApiError(res.status, err.error ?? "upload_failed", err.details);
  }
  return body as T;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(code);
  }
}

export interface SmtpCreateInput {
  name: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
  imapHost?: string | null;
  imapPort?: number | null;
  imapUser?: string | null;
  imapPass?: string | null;
  dailyLimit: number;
}

export type SmtpUpdateInput = Partial<SmtpCreateInput>;

export interface LeadsPage {
  total: number;
  page: number;
  pageSize: number;
  rows: LeadDTO[];
}

export interface TemplateTestInput {
  smtpConfigId: number;
  to: string;
  subject: string;
  body: string;
}

export const api = {
  login: (password: string) =>
    request<{ ok: true }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),
  me: () => request<{ ok: true }>("/auth/me"),

  smtp: {
    list: () => request<SmtpConfigDTO[]>("/smtp"),
    create: (input: SmtpCreateInput) =>
      request<SmtpConfigDTO>("/smtp", { method: "POST", body: JSON.stringify(input) }),
    update: (id: number, input: SmtpUpdateInput) =>
      request<SmtpConfigDTO>(`/smtp/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    remove: (id: number) => request<{ ok: true }>(`/smtp/${id}`, { method: "DELETE" }),
    test: (id: number, to: string) =>
      request<{ ok: true; messageId?: string }>(`/smtp/${id}/test`, {
        method: "POST",
        body: JSON.stringify({ to }),
      }),
  },

  templates: {
    list: () => request<TemplateDTO[]>("/templates"),
    create: (input: { name: string; subject: string; body: string }) =>
      request<TemplateDTO>("/templates", { method: "POST", body: JSON.stringify(input) }),
    update: (id: number, input: Partial<{ name: string; subject: string; body: string }>) =>
      request<TemplateDTO>(`/templates/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    remove: (id: number) => request<{ ok: true }>(`/templates/${id}`, { method: "DELETE" }),
    test: (input: TemplateTestInput) =>
      request<{ ok: true; messageId?: string }>("/templates/test", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  },

  campaigns: {
    list: () => request<CampaignDTO[]>("/campaigns"),
    get: (id: number) => request<CampaignDTO>(`/campaigns/${id}`),
    create: (input: { name: string; smtpConfigId: number }) =>
      request<CampaignDTO>("/campaigns", { method: "POST", body: JSON.stringify(input) }),
    update: (id: number, input: { name?: string; smtpConfigId?: number }) =>
      request<CampaignDTO>(`/campaigns/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    remove: (id: number) => request<{ ok: true }>(`/campaigns/${id}`, { method: "DELETE" }),
    upload: (id: number, file: File) => uploadFile<UploadPreview>(`/campaigns/${id}/upload`, file),
    import: (id: number, mapping: ColumnMapping) =>
      request<ImportResult>(`/campaigns/${id}/import`, {
        method: "POST",
        body: JSON.stringify({ mapping }),
      }),
    getSteps: (id: number) => request<SequenceStepDTO[]>(`/campaigns/${id}/steps`),
    putSteps: (
      id: number,
      steps: Array<{
        order: number;
        subjectTpl: string;
        bodyTpl: string;
        delayDays: number;
        defaultTemplateId?: number | null;
      }>,
    ) =>
      request<SequenceStepDTO[]>(`/campaigns/${id}/steps`, {
        method: "PUT",
        body: JSON.stringify({ steps }),
      }),
    launch: (id: number) => request<{ ok: true; enqueued: number }>(`/campaigns/${id}/launch`, { method: "POST" }),
    pause: (id: number) => request<{ ok: true }>(`/campaigns/${id}/pause`, { method: "POST" }),
    resume: (id: number) => request<{ ok: true }>(`/campaigns/${id}/resume`, { method: "POST" }),
    getSegments: (id: number, previewColumn?: string) => {
      const qs = previewColumn ? `?column=${encodeURIComponent(previewColumn)}` : "";
      return request<{
        segmentColumn: string | null;
        previewColumn: string | null;
        headers: string[];
        uniqueValues: Array<{ value: string; count: number }>;
        steps: Array<{ id: number; order: number; rules: Array<{ segmentValue: string; templateId: number }> }>;
      }>(`/campaigns/${id}/segments${qs}`);
    },
    putSegments: (
      id: number,
      input: {
        segmentColumn: string | null;
        rules: Array<{ stepId: number; segmentValue: string; templateId: number }>;
      },
    ) =>
      request<{ ok: true }>(`/campaigns/${id}/segments`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    leads: (id: number, params: { status?: string; page?: number; pageSize?: number } = {}) => {
      const qs = new URLSearchParams();
      if (params.status) qs.set("status", params.status);
      if (params.page) qs.set("page", String(params.page));
      if (params.pageSize) qs.set("pageSize", String(params.pageSize));
      return request<LeadsPage>(`/campaigns/${id}/leads${qs.size ? `?${qs}` : ""}`);
    },
    exportUrl: (id: number) => `${BASE}/campaigns/${id}/export`,
  },

  leads: {
    get: (id: number) => request<LeadDetail>(`/leads/${id}`),
  },
};
