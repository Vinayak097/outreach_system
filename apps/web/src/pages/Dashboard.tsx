import type { CampaignDTO, SmtpConfigDTO } from "@outreach/shared";
import { Plus } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Dialog } from "../components/ui/Dialog";
import { StatusBadge } from "../components/ui/StatusBadge";
import { ApiError, api } from "../lib/api";

export function Dashboard() {
  const [campaigns, setCampaigns] = useState<CampaignDTO[]>([]);
  const [smtps, setSmtps] = useState<SmtpConfigDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [smtpId, setSmtpId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  async function refresh() {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([api.campaigns.list(), api.smtp.list()]);
      setCampaigns(c);
      setSmtps(s);
      if (s[0] && smtpId === null) setSmtpId(s[0].id);
    } catch {
      toast.error("Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!smtpId) return;
    setCreating(true);
    try {
      const c = await api.campaigns.create({ name, smtpConfigId: smtpId });
      setCreateOpen(false);
      setName("");
      navigate(`/campaigns/${c.id}/new?step=upload`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.code : "Create failed";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h1">Campaigns</h1>
          <p className="text-small text-ink-secondary">
            {campaigns.length} total
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            if (smtps.length === 0) {
              toast.error("Add an SMTP config in Settings first");
              return;
            }
            setName("");
            setSmtpId(smtps[0]?.id ?? null);
            setCreateOpen(true);
          }}
        >
          <Plus size={14} />
          New campaign
        </button>
      </div>

      {loading ? (
        <div className="card p-6 text-small text-ink-secondary">Loading…</div>
      ) : campaigns.length === 0 ? (
        <div className="card p-8 text-center space-y-2">
          <div className="text-h2">No campaigns yet</div>
          <div className="text-small text-ink-secondary">
            Click "New campaign" to upload a lead list and build your sequence.
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-body">
            <thead className="bg-surface-secondary text-ink-secondary text-small">
              <tr>
                <Th>Name</Th>
                <Th>Status</Th>
                <Th>Segment col</Th>
                <Th align="right">Leads</Th>
                <Th align="right">Sent</Th>
                <Th align="right">Opened</Th>
                <Th align="right">Clicked</Th>
                <Th align="right">Replied</Th>
                <Th align="right">Bounced</Th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr
                  key={c.id}
                  className="border-t hover:bg-surface-secondary cursor-pointer"
                  onClick={() => navigate(`/campaigns/${c.id}`)}
                >
                  <Td>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-small text-ink-tertiary">
                      Created {new Date(c.createdAt).toLocaleDateString()}
                    </div>
                  </Td>
                  <Td>
                    <StatusBadge status={c.status} />
                  </Td>
                  <Td>
                    {c.segmentColumn
                      ? <span className="font-mono text-small bg-surface-secondary px-1.5 py-0.5 rounded">{c.segmentColumn}</span>
                      : <span className="text-ink-tertiary">—</span>
                    }
                  </Td>
                  <Td align="right">{c.metrics?.total ?? 0}</Td>
                  <Td align="right">{c.metrics?.sent ?? 0}</Td>
                  <Td align="right">{c.metrics?.opened ?? 0}</Td>
                  <Td align="right">{c.metrics?.clicked ?? 0}</Td>
                  <Td align="right">{c.metrics?.replied ?? 0}</Td>
                  <Td align="right">{c.metrics?.bounced ?? 0}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New campaign"
        description="Pick a name and the SMTP account to send from."
      >
        <form onSubmit={onCreate} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-small text-ink-secondary">Campaign name</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Q2 outbound — SaaS founders"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-small text-ink-secondary">Send from</span>
            <select
              className="input"
              value={smtpId ?? ""}
              onChange={(e) => setSmtpId(Number(e.target.value))}
              required
            >
              {smtps.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.fromEmail}
                </option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn" onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={creating || !name}>
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th className={`px-3 py-2 font-medium ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <td className={`px-3 py-2 ${align === "right" ? "text-right" : "text-left"}`}>{children}</td>
  );
}
