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
}

export interface SequenceStepDTO {
  id: number;
  order: number;
  subjectTpl: string;
  bodyTpl: string;
  delayDays: number;
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
  createdAt: string;
  metrics?: CampaignMetrics;
}

export interface AuthMeResponse {
  ok: true;
}

export interface ApiError {
  error: string;
  details?: unknown;
}
