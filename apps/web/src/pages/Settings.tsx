import type { SmtpConfigDTO } from "@outreach/shared";
import { Pencil, Plus, Send, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog } from "../components/ui/Dialog";
import { ApiError, SmtpCreateInput, api } from "../lib/api";

type FormState = SmtpCreateInput & { id?: number };
type Preset = "gmail" | "outlook" | "custom";

const presets: Record<Preset, Partial<SmtpCreateInput>> = {
  gmail: {
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    imapHost: "imap.gmail.com",
    imapPort: 993,
  },
  outlook: {
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    imapHost: "outlook.office365.com",
    imapPort: 993,
  },
  custom: {},
};

const emptyForm: FormState = {
  name: "",
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  username: "",
  password: "",
  fromName: "",
  fromEmail: "",
  imapHost: "imap.gmail.com",
  imapPort: 993,
  imapUser: "",
  imapPass: "",
  dailyLimit: 50,
};

export function Settings() {
  const [configs, setConfigs] = useState<SmtpConfigDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [testOpen, setTestOpen] = useState<SmtpConfigDTO | null>(null);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [preset, setPreset] = useState<Preset>("gmail");
  const [showAdvanced, setShowAdvanced] = useState(false);

  function applyPreset(p: Preset) {
    setPreset(p);
    const d = presets[p];
    setForm((f) => ({ ...f, ...d }));
  }

  async function refresh() {
    setLoading(true);
    try {
      setConfigs(await api.smtp.list());
    } catch {
      toast.error("Failed to load SMTP configs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function detectPreset(host: string): Preset {
    if (host.includes("gmail.com")) return "gmail";
    if (host.includes("office365.com") || host.includes("outlook.com")) return "outlook";
    return "custom";
  }

  function openCreate() {
    setForm(emptyForm);
    setPreset("gmail");
    setShowAdvanced(false);
    setFormOpen(true);
  }

  function openEdit(c: SmtpConfigDTO) {
    setForm({
      id: c.id,
      name: c.name,
      host: c.host,
      port: c.port,
      secure: c.secure,
      username: c.username,
      password: "",
      fromName: c.fromName,
      fromEmail: c.fromEmail,
      imapHost: c.imapHost ?? "",
      imapPort: c.imapPort ?? 993,
      imapUser: c.imapUser ?? "",
      imapPass: "",
      dailyLimit: c.dailyLimit,
    });
    const p = detectPreset(c.host);
    setPreset(p);
    setShowAdvanced(p === "custom");
    setFormOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const isPreset = preset !== "custom";
      const email = form.fromEmail.trim();
      const username = isPreset ? email : form.username || email;
      const imapUser = isPreset ? email : form.imapUser || username;
      const imapHost = form.imapHost || null;
      const payload: SmtpCreateInput = {
        name: form.name,
        host: form.host,
        port: Number(form.port),
        secure: form.secure,
        username,
        password: form.password,
        fromName: form.fromName || email,
        fromEmail: email,
        imapHost,
        imapPort: imapHost ? Number(form.imapPort) : null,
        imapUser: imapHost ? imapUser : null,
        imapPass: imapHost ? form.imapPass || null : null,
        dailyLimit: Number(form.dailyLimit),
      };
      if (form.id) {
        const update = { ...payload };
        if (!update.password) delete (update as Partial<SmtpCreateInput>).password;
        if (!form.imapPass) delete (update as Partial<SmtpCreateInput>).imapPass;
        await api.smtp.update(form.id, update);
        toast.success("SMTP config updated");
      } else {
        await api.smtp.create(payload);
        toast.success("SMTP config created");
      }
      setFormOpen(false);
      await refresh();
    } catch (err) {
      const msg =
        err instanceof ApiError ? `${err.code}: ${JSON.stringify(err.details ?? {})}` : "Save failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(c: SmtpConfigDTO) {
    if (!confirm(`Delete "${c.name}"? This cannot be undone.`)) return;
    try {
      await api.smtp.remove(c.id);
      toast.success("Deleted");
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.code === "smtp_in_use") {
        toast.error("Cannot delete — used by existing campaigns");
      } else {
        toast.error("Delete failed");
      }
    }
  }

  async function onTest(e: FormEvent) {
    e.preventDefault();
    if (!testOpen) return;
    setTesting(true);
    try {
      const res = await api.smtp.test(testOpen.id, testTo);
      toast.success(`Sent (messageId: ${res.messageId ?? "ok"})`);
      setTestOpen(null);
      setTestTo("");
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? (err.details as { message?: string } | undefined)?.message ?? err.code
          : "Test failed";
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h1">Settings</h1>
          <p className="text-small text-ink-secondary">SMTP accounts used for sending.</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={14} />
          Add SMTP
        </button>
      </div>

      {loading ? (
        <div className="card p-6 text-small text-ink-secondary">Loading…</div>
      ) : configs.length === 0 ? (
        <div className="card p-8 text-center space-y-2">
          <div className="text-h2">No SMTP configured</div>
          <div className="text-small text-ink-secondary">
            Add one to start sending campaigns.
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-body">
            <thead className="bg-surface-secondary text-ink-secondary text-small">
              <tr>
                <Th>Name</Th>
                <Th>From</Th>
                <Th>Host</Th>
                <Th>IMAP</Th>
                <Th>Daily limit</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {configs.map((c) => (
                <tr key={c.id} className="border-t">
                  <Td>{c.name}</Td>
                  <Td>
                    {c.fromName} &lt;{c.fromEmail}&gt;
                  </Td>
                  <Td>
                    {c.host}:{c.port} {c.secure && <span className="text-ink-tertiary">tls</span>}
                  </Td>
                  <Td>
                    {c.imapHost ? (
                      <span className="badge bg-info-bg text-info-fg">on</span>
                    ) : (
                      <span className="text-ink-tertiary">off</span>
                    )}
                  </Td>
                  <Td>{c.dailyLimit}</Td>
                  <Td align="right">
                    <div className="inline-flex gap-1">
                      <button
                        className="btn text-ink-secondary"
                        onClick={() => {
                          setTestOpen(c);
                          setTestTo("");
                        }}
                        title="Send test email"
                      >
                        <Send size={14} />
                      </button>
                      <button className="btn text-ink-secondary" onClick={() => openEdit(c)} title="Edit">
                        <Pencil size={14} />
                      </button>
                      <button className="btn text-ink-secondary" onClick={() => onDelete(c)} title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={form.id ? "Edit SMTP" : "Add SMTP"}
        description="Credentials are encrypted at rest."
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <Row>
            <Field label="Provider">
              <select
                className="input"
                value={preset}
                onChange={(e) => applyPreset(e.target.value as Preset)}
              >
                <option value="gmail">Gmail</option>
                <option value="outlook">Outlook / Office 365</option>
                <option value="custom">Custom SMTP</option>
              </select>
            </Field>
            <Field label="Label" required>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder={preset === "gmail" ? "Work Gmail" : "Main inbox"}
              />
            </Field>
          </Row>

          <Row>
            <Field label="Email address" required>
              <input
                className="input"
                type="email"
                value={form.fromEmail}
                onChange={(e) => setForm({ ...form, fromEmail: e.target.value })}
                placeholder="you@gmail.com"
                required
              />
            </Field>
            <Field
              label={
                form.id
                  ? preset === "gmail"
                    ? "App password (leave blank to keep)"
                    : "Password (leave blank to keep)"
                  : preset === "gmail"
                    ? "App password"
                    : "Password"
              }
              required={!form.id}
            >
              <input
                className="input"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required={!form.id}
                placeholder={preset === "gmail" ? "16-char Google app password" : ""}
              />
            </Field>
          </Row>

          <Row>
            <Field label="From name">
              <input
                className="input"
                value={form.fromName}
                onChange={(e) => setForm({ ...form, fromName: e.target.value })}
                placeholder="Defaults to email if blank"
              />
            </Field>
            <Field label="Daily limit">
              <input
                className="input"
                type="number"
                value={form.dailyLimit}
                onChange={(e) => setForm({ ...form, dailyLimit: Number(e.target.value) })}
              />
            </Field>
          </Row>

          {preset === "gmail" && (
            <div className="rounded-card bg-info-bg text-info-fg text-small p-3">
              Gmail requires a 16-character app password (not your account password).{" "}
              <a
                className="underline"
                href="https://myaccount.google.com/apppasswords"
                target="_blank"
                rel="noreferrer"
              >
                Create one here
              </a>
              .
            </div>
          )}

          <div className="pt-2 border-t">
            <button
              type="button"
              className="text-small text-ink-secondary hover:text-ink-primary"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? "Hide" : "Show"} advanced (host, port, IMAP)
            </button>
          </div>

          {showAdvanced && (
            <div className="space-y-4">
              <Row>
                <Field label="SMTP host" required>
                  <input
                    className="input"
                    value={form.host}
                    onChange={(e) => setForm({ ...form, host: e.target.value })}
                    required
                  />
                </Field>
                <Field label="SMTP port" required>
                  <input
                    className="input"
                    type="number"
                    value={form.port}
                    onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
                    required
                  />
                </Field>
              </Row>
              <Row>
                <Field label="TLS mode">
                  <select
                    className="input"
                    value={form.secure ? "true" : "false"}
                    onChange={(e) => setForm({ ...form, secure: e.target.value === "true" })}
                  >
                    <option value="false">STARTTLS (port 587)</option>
                    <option value="true">SSL/TLS (port 465)</option>
                  </select>
                </Field>
                {preset === "custom" && (
                  <Field label="Username (if different from email)">
                    <input
                      className="input"
                      value={form.username}
                      onChange={(e) => setForm({ ...form, username: e.target.value })}
                      placeholder="Defaults to email"
                    />
                  </Field>
                )}
              </Row>

              <div className="pt-2 border-t">
                <div className="text-small text-ink-secondary mb-2">
                  IMAP (optional — enables reply detection)
                </div>
                <Row>
                  <Field label="IMAP host">
                    <input
                      className="input"
                      value={form.imapHost ?? ""}
                      onChange={(e) => setForm({ ...form, imapHost: e.target.value })}
                      placeholder="Leave blank to disable"
                    />
                  </Field>
                  <Field label="IMAP port">
                    <input
                      className="input"
                      type="number"
                      value={form.imapPort ?? 993}
                      onChange={(e) => setForm({ ...form, imapPort: Number(e.target.value) })}
                    />
                  </Field>
                </Row>
                <Row>
                  {preset === "custom" && (
                    <Field label="IMAP user (if different from email)">
                      <input
                        className="input"
                        value={form.imapUser ?? ""}
                        onChange={(e) => setForm({ ...form, imapUser: e.target.value })}
                      />
                    </Field>
                  )}
                  <Field
                    label={
                      form.id ? "IMAP password (leave blank = reuse SMTP password)" : "IMAP password (blank = reuse SMTP)"
                    }
                  >
                    <input
                      className="input"
                      type="password"
                      value={form.imapPass ?? ""}
                      onChange={(e) => setForm({ ...form, imapPass: e.target.value })}
                    />
                  </Field>
                </Row>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn" onClick={() => setFormOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={testOpen !== null}
        onOpenChange={(o) => !o && setTestOpen(null)}
        title="Send test email"
        description={testOpen?.name}
      >
        <form onSubmit={onTest} className="space-y-4">
          <Field label="Recipient" required>
            <input
              className="input"
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setTestOpen(null)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={testing || !testTo}>
              {testing ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1 block col-span-1">
      <span className="text-small text-ink-secondary">
        {label}
        {required && <span className="text-danger-fg"> *</span>}
      </span>
      {children}
    </label>
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
