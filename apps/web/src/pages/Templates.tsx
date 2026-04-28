import type { TemplateDTO } from "@outreach/shared";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { RichEditor } from "../components/ui/RichEditor";
import { Dialog } from "../components/ui/Dialog";
import { ApiError, api } from "../lib/api";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

const VARIABLES = [
  "{{first_name}}",
  "{{last_name}}",
  "{{company}}",
  "{{job_title}}",
  "{{email}}",
  "{{sender_name}}",
];

interface FormState {
  id?: number;
  name: string;
  subject: string;
  body: string;
}

const empty: FormState = { name: "", subject: "", body: "" };

export function Templates() {
  const [templates, setTemplates] = useState<TemplateDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      setTemplates(await api.templates.list());
    } catch {
      toast.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function openCreate() {
    setForm(empty);
    setFormOpen(true);
  }

  function openEdit(t: TemplateDTO) {
    setForm({ id: t.id, name: t.name, subject: t.subject, body: t.body });
    setFormOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (form.id) {
        await api.templates.update(form.id, {
          name: form.name,
          subject: form.subject,
          body: form.body,
        });
        toast.success("Template updated");
      } else {
        await api.templates.create({ name: form.name, subject: form.subject, body: form.body });
        toast.success("Template created");
      }
      setFormOpen(false);
      await refresh();
    } catch (err) {
      const msg = err instanceof ApiError ? err.code : "Save failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(t: TemplateDTO) {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    try {
      await api.templates.remove(t.id);
      toast.success("Deleted");
      await refresh();
    } catch {
      toast.error("Delete failed");
    }
  }

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h1">Templates</h1>
          <p className="text-small text-ink-secondary">
            Reusable subject + body snippets. Insert into any sequence step while editing a campaign.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={14} />
          New template
        </button>
      </div>

      {loading ? (
        <div className="card p-6 text-small text-ink-secondary">Loading…</div>
      ) : templates.length === 0 ? (
        <div className="card p-8 text-center space-y-2">
          <div className="text-h2">No templates yet</div>
          <div className="text-small text-ink-secondary">
            Create one to reuse across campaigns.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id} className="card p-4 flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{t.name}</div>
                <div className="text-small text-ink-secondary truncate">{t.subject}</div>
                <div className="text-small text-ink-tertiary mt-1 line-clamp-2">
                  {stripHtml(t.body).slice(0, 200)}
                </div>
                <div className="text-tiny text-ink-tertiary mt-2">
                  Updated {new Date(t.updatedAt).toLocaleString()}
                </div>
              </div>
              <div className="inline-flex gap-1 shrink-0">
                <button className="btn text-ink-secondary" onClick={() => openEdit(t)} title="Edit">
                  <Pencil size={14} />
                </button>
                <button className="btn text-ink-secondary" onClick={() => onDelete(t)} title="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={form.id ? "Edit template" : "New template"}
        description=""
      >
        <form onSubmit={onSubmit} className="space-y-3">
          {/* Variable chips */}
          <div className="space-y-1">
            <span className="text-small text-ink-secondary">Available variables</span>
            <div className="flex flex-wrap gap-1.5">
              {VARIABLES.map((v) => (
                <code
                  key={v}
                  className="badge bg-surface-secondary text-ink-secondary border cursor-pointer hover:bg-surface-tertiary"
                  title="Click to copy"
                  onClick={() => { navigator.clipboard.writeText(v); toast.success(`Copied ${v}`); }}
                >
                  {v}
                </code>
              ))}
              <code className="badge bg-surface-secondary text-ink-tertiary border">
                {"{{custom.col_name}}"}
              </code>
            </div>
          </div>

          <label className="block space-y-1">
            <span className="text-small text-ink-secondary">Template name *</span>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              placeholder="Cold intro v1"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-small text-ink-secondary">Subject *</span>
            <input
              className="input"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              required
              placeholder="Quick idea for {{company}}"
            />
          </label>
          <div className="space-y-1">
            <span className="text-small text-ink-secondary">Body *</span>
            <p className="text-tiny text-ink-tertiary">
              You can style text with color and email-safe fonts here. Those styles are saved in the template HTML.
            </p>
            <RichEditor
              value={form.body}
              onChange={(v) => setForm((f) => ({ ...f, body: v }))}
              placeholder="Hi {{first_name}}, ..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn" onClick={() => setFormOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || !form.name || !form.subject || !form.body || form.body === "<br>"}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
