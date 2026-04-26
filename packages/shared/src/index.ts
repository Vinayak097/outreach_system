export type CampaignStatus =
  | "draft"
  | "active"
  | "paused"
  | "completed";

export type LeadStatus =
  | "pending"
  | "queued"
  | "sent"
  | "opened"
  | "clicked"
  | "replied"
  | "bounced"
  | "failed";

export interface ColumnMapping {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  jobTitle?: string;
  replyStatus?: string;
  emailSentStatus?: string;
  TemplateName?: string;
  segmentColumn?: string;
  custom: string[];
}

export interface LeadDTO {
  id: number;
  campaignId: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  jobTitle: string | null;
  customFields: Record<string, string>;
  sourceRowIndex: number;
  status: LeadStatus;
  currentStep: number;
  createdAt: string;
  lastTemplateName?: string | null;
}

export interface SequenceStepDTO {
  id: number;
  order: number;
  subjectTpl: string;
  bodyTpl: string;
  delayDays: number;
  defaultTemplateId: number | null;
}

export interface SmtpConfigDTO {
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
  createdAt: string;
}

export interface CampaignMetrics {
  total: number;
  pending: number;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  failed: number;
}

export interface CampaignDTO {
  id: number;
  name: string;
  status: CampaignStatus;
  smtpConfigId: number;
  originalFileName: string | null;
  columnMapping: ColumnMapping | null;
  segmentColumn: string | null;
  createdAt: string;
  metrics?: CampaignMetrics;
}

export interface AuthMeResponse {
  ok: true;
}

export interface TemplateDTO {
  id: number;
  name: string;
  subject: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface UploadPreview {
  headers: string[];
  sampleRows: Record<string, string>[];
  totalRows: number;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  preReplied: number;
  skipReasons?: Array<{ row: number; reason: string; rawEmail: string }>;
  parsedHeaders?: string[];
}

export interface LeadTimelineEntry {
  id: number;
  stepId: number;
  stepOrder: number;
  subject: string;
  trackingId: string;
  scheduledFor: string;
  sentAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  repliedAt: string | null;
  bouncedAt: string | null;
  failedAt: string | null;
  errorMessage: string | null;
}

export interface LeadDetail extends LeadDTO {
  timeline: LeadTimelineEntry[];
}

export interface ApiError {
  error: string;
  details?: unknown;
}
