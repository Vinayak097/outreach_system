import type { CampaignDTO, LeadDetail, LeadDTO, SequenceStepDTO } from "@outreach/shared";
import { ArrowLeft, Download, Pause, Play, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { StatusBadge } from "../components/ui/StatusBadge";
import { ApiError, LeadsPage, api } from "../lib/api";
import { cn } from "../lib/utils";

type Tab = "leads" | "sequence" | "settings";

export function CampaignDetail() {
  const { id: idStr } = useParams<{ id: string }>();
  const id = Number(idStr);
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "leads";
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<CampaignDTO | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      setCampaign(await api.campaigns.get(id));
    } catch {
      toast.error("Failed to load campaign");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function onPauseResume() {
    if (!campaign) return;
    setBusy(true);
    try {
      if (campaign.status === "active") {
        await api.campaigns.pause(id);
        toast.success("Paused");
      } else if (campaign.status === "paused") {
        await api.campaigns.resume(id);
        toast.success("Resumed");
      }
      await refresh();
    } catch {
      toast.error("Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!campaign) return;
    if (!confirm(`Delete "${campaign.name}" and all its leads? Cannot be undone.`)) return;
    try {
      await api.campaigns.remove(id);
      toast.success("Deleted");
      navigate("/");
    } catch {
      toast.error("Delete failed");
    }
  }

  if (!campaign) return <div className="p-6 text-small text-ink-secondary">Loading…</div>;

  const m = campaign.metrics ?? { total: 0, pending: 0, sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, failed: 0 };
  const openRate = m.sent > 0 ? Math.round(((m.opened + m.clicked + m.replied) / m.sent) * 100) : 0;
  const replyRate = m.sent > 0 ? Math.round((m.replied / m.sent) * 100) : 0;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button className="btn" onClick={() => navigate("/")}>
            <ArrowLeft size={14} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-h1">{campaign.name}</h1>
              <StatusBadge status={campaign.status} />
            </div>
            <div className="text-small text-ink-tertiary">
              Created {new Date(campaign.createdAt).toLocaleString()}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {campaign.status === "draft" && (
            <button className="btn btn-primary" onClick={() => navigate(`/campaigns/${id}/new?step=sequence`)}>
              Continue setup
            </button>
          )}
          {(campaign.status === "active" || campaign.status === "paused") && (
            <button className="btn" onClick={onPauseResume} disabled={busy}>
              {campaign.status === "active" ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Resume</>}
            </button>
          )}
          <a className="btn" href={api.campaigns.exportUrl(id)}>
            <Download size={14} /> Export
          </a>
          <button className="btn text-danger-fg" onClick={onDelete}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Metric label="Total leads" value={m.total} />
        <Metric label="Sent" value={m.sent} />
        <Metric label="Open rate" value={`${openRate}%`} hint={`${m.opened + m.clicked + m.replied} of ${m.sent}`} />
        <Metric label="Reply rate" value={`${replyRate}%`} hint={`${m.replied} replied`} />
      </div>
      <div className="grid grid-cols-4 gap-3">
        <Metric label="Pending" value={m.pending} tone="ink-secondary" />
        <Metric label="Clicked" value={m.clicked} tone="ink-secondary" />
        <Metric label="Bounced" value={m.bounced} tone="danger-fg" />
        <Metric label="Failed" value={m.failed} tone="danger-fg" />
      </div>

      <div className="border-b flex gap-2">
        {(["leads", "sequence", "settings"] as Tab[]).map((t) => (
          <button
            key={t}
            className={cn(
              "px-3 py-2 text-body border-b-2 -mb-px capitalize",
              tab === t ? "border-ink-primary text-ink-primary" : "border-transparent text-ink-secondary",
            )}
            onClick={() => setParams({ tab: t })}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "leads" && <LeadsTab campaignId={id} segmentColumn={campaign.segmentColumn ?? null} />}
      {tab === "sequence" && <SequenceTab campaignId={id} editable={campaign.status === "draft"} />}
      {tab === "settings" && <CampaignSettingsTab campaign={campaign} onChanged={refresh} />}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="card p-4">
      <div className="text-small text-ink-secondary">{label}</div>
      <div className={cn("text-h1 font-medium mt-1", tone && `text-${tone}`)}>{value}</div>
      {hint && <div className="text-tiny text-ink-tertiary mt-1">{hint}</div>}
    </div>
  );
}

function LeadsTab({ campaignId, segmentColumn }: { campaignId: number; segmentColumn: string | null }) {
  const [page, setPage] = useState<LeadsPage | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selected, setSelected] = useState<LeadDetail | null>(null);
  console.log(selected , ' seletcted leads ',page)
  async function refresh() {
    try {
      const p = await api.campaigns.leads(campaignId, { page: pageNum, status: statusFilter || undefined });
      setPage(p);
    } catch {
      toast.error("Failed to load leads");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, pageNum, statusFilter]);

  async function openLead(l: LeadDTO) {
    try {
      setSelected(await api.leads.get(l.id));
    } catch {
      toast.error("Failed to load lead");
    }
  }

  return (
    <div className="flex gap-4">
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center justify-between">
          <select
            className="input w-auto"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPageNum(1);
            }}
          >
            <option value="">All statuses</option>
            {["pending", "sent", "opened", "clicked", "replied", "bounced", "failed"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {page && (
            <div className="text-small text-ink-secondary">
              {page.total} leads · page {page.page} of {Math.max(1, Math.ceil(page.total / page.pageSize))}
            </div>
          )}
        </div>
        <div className="card overflow-hidden">
          <table className="w-full text-body">
            <thead className="bg-surface-secondary text-ink-secondary text-small">
              <tr>
                <Th>Email</Th>
                <Th>Name</Th>
                <Th>Company</Th>
                <Th>Step</Th>
                <Th>Status</Th>
                <Th>template Name</Th>
                <Th>SegmentColumn</Th>
              </tr>
            </thead>
            <tbody>
              {page?.rows.map((l) => (
                <tr
                  key={l.id}
                  className={cn(
                    "border-t cursor-pointer hover:bg-surface-secondary",
                    selected?.id === l.id && "bg-surface-tertiary",
                  )}
                  onClick={() => openLead(l)}
                >
                  <Td>{l.email}</Td>
                  <Td>
                    {[l.firstName, l.lastName].filter(Boolean).join(" ")}
                  </Td>
                  <Td>{l.company || "—"}</Td>
                  <Td>{l.currentStep || "—"}</Td>
                  <Td>
                    <StatusBadge status={l.status} />
                  </Td>
                  <Td>{l.lastTemplateName || "—"}</Td>
                  <Td>{segmentColumn ? (l.customFields[segmentColumn] || "—") : "—"}</Td>
                </tr>
              ))}
              {page?.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-small text-ink-secondary">
                    No leads match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {page && page.total > page.pageSize && (
          <div className="flex justify-between">
            <button className="btn" onClick={() => setPageNum((n) => Math.max(1, n - 1))} disabled={pageNum === 1}>
              Prev
            </button>
            <button
              className="btn"
              onClick={() => setPageNum((n) => n + 1)}
              disabled={pageNum * page.pageSize >= page.total}
            >
              Next
            </button>
          </div>
        )}
      </div>
      {selected && <LeadPanel lead={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function LeadPanel({ lead, onClose }: { lead: LeadDetail; onClose: () => void }) {
  return (
    <aside className="w-80 shrink-0 space-y-3">
      <div className="card p-4 space-y-2">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-h2">{lead.email}</div>
            <div className="text-small text-ink-secondary">
              {[lead.firstName, lead.lastName].filter(Boolean).join(" ") || "—"}
            </div>
          </div>
          <button className="btn text-ink-secondary" onClick={onClose}>×</button>
        </div>
        <div className="space-y-1 text-small">
          <Row label="Status"><StatusBadge status={lead.status} /></Row>
          {lead.company && <Row label="Company">{lead.company}</Row>}
          {lead.jobTitle && <Row label="Title">{lead.jobTitle}</Row>}
          <Row label="Current step">{lead.currentStep || "—"}</Row>
        </div>
        {Object.keys(lead.customFields).length > 0 && (
          <div className="pt-2 border-t space-y-1">
            <div className="text-small text-ink-secondary">Custom</div>
            {Object.entries(lead.customFields).map(([k, v]) => (
              <Row key={k} label={k}>{v}</Row>
            ))}
          </div>
        )}
      </div>

      <div className="card p-4 space-y-2">
        <div className="text-h2">Timeline</div>
        {lead.timeline.length === 0 ? (
          <div className="text-small text-ink-tertiary">No sends yet.</div>
        ) : (
          <ol className="space-y-3">
            {lead.timeline.map((t) => (
              <li key={t.id} className="border-l-2 pl-3 space-y-0.5">
                <div className="text-small font-medium">Step {t.stepOrder}</div>
                <div className="text-small text-ink-secondary truncate">{t.subject}</div>
                <div className="text-tiny text-ink-tertiary space-y-0.5">
                  <div>Scheduled {new Date(t.scheduledFor).toLocaleString()}</div>
                  {t.sentAt && <div>Sent {new Date(t.sentAt).toLocaleString()}</div>}
                  {t.openedAt && <div className="text-success-fg">Opened {new Date(t.openedAt).toLocaleString()}</div>}
                  {t.clickedAt && <div className="text-success-fg">Clicked {new Date(t.clickedAt).toLocaleString()}</div>}
                  {t.repliedAt && <div className="text-success-fg">Replied {new Date(t.repliedAt).toLocaleString()}</div>}
                  {t.bouncedAt && <div className="text-danger-fg">Bounced {new Date(t.bouncedAt).toLocaleString()}</div>}
                  {t.failedAt && !t.bouncedAt && (
                    <div className="text-danger-fg">Failed: {t.errorMessage || "unknown"}</div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2 text-small">
      <span className="text-ink-tertiary shrink-0 capitalize">{label.replace(/_/g, " ")}</span>
      <span className="text-right truncate">{children}</span>
    </div>
  );
}

function SequenceTab({ campaignId, editable }: { campaignId: number; editable: boolean }) {
  const [steps, setSteps] = useState<SequenceStepDTO[]>([]);
  const [templates, setTemplates] = useState<Record<number, { name: string; subject: string; body: string }>>({});
  useEffect(() => {
    api.campaigns.getSteps(campaignId).then(setSteps).catch(() => undefined);
    api.templates
      .list()
      .then((ts) => {
        const m: Record<number, { name: string; subject: string; body: string }> = {};
        for (const t of ts) m[t.id] = { name: t.name, subject: t.subject, body: t.body };
        setTemplates(m);
      })
      .catch(() => undefined);
  }, [campaignId]);

  if (steps.length === 0) {
    return (
      <div className="card p-6 text-center space-y-2">
        <div className="text-small text-ink-secondary">No sequence steps yet.</div>
        {editable && (
          <a className="btn btn-primary inline-flex" href={`/campaigns/${campaignId}/new?step=sequence`}>
            Build sequence
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {steps.map((s) => {
        const tpl = s.defaultTemplateId ? templates[s.defaultTemplateId] : null;
        const subject = tpl?.subject ?? s.subjectTpl;
        const body = tpl?.body ?? s.bodyTpl;
        return (
          <div key={s.id} className="card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-h2">Step {s.order}</div>
              <div className="text-small text-ink-tertiary">
                {s.order === 1 ? "Sent immediately" : `+${s.delayDays} days after previous`}
              </div>
            </div>
            {tpl ? (
              <div className="text-small text-ink-secondary">
                Default template: <span className="text-ink-primary">{tpl.name}</span>
              </div>
            ) : !subject && !body ? (
              <div className="text-small text-warning-fg">No template assigned.</div>
            ) : null}
            {(subject || body) && (
              <>
                <div className="space-y-1 text-small">
                  <div className="text-ink-secondary">Subject</div>
                  <div className="text-ink-primary">{subject}</div>
                </div>
                <div className="space-y-1 text-small">
                  <div className="text-ink-secondary">Body</div>
                  <pre className="whitespace-pre-wrap font-mono text-small bg-surface-secondary rounded-card p-3">
                    {body}
                  </pre>
                </div>
              </>
            )}
          </div>
        );
      })}
      {editable && (
        <a className="btn" href={`/campaigns/${campaignId}/new?step=sequence`}>
          Edit sequence
        </a>
      )}
    </div>
  );
}

function CampaignSettingsTab({
  campaign,
  onChanged,
}: {
  campaign: CampaignDTO;
  onChanged: () => void;
}) {
  const [name, setName] = useState(campaign.name);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.campaigns.update(campaign.id, { name });
      toast.success("Saved");
      onChanged();
    } catch (err) {
      const msg = err instanceof ApiError ? err.code : "Save failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-4 space-y-3 max-w-xl">
      <label className="block space-y-1">
        <span className="text-small text-ink-secondary">Campaign name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="flex justify-end">
        <button className="btn btn-primary" onClick={save} disabled={saving || !name}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 font-medium text-left">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 text-left">{children}</td>;
}
