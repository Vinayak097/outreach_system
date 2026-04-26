import type { ColumnMapping, ImportResult, SequenceStepDTO, TemplateDTO, UploadPreview } from "@outreach/shared";
import { ArrowLeft, ArrowRight, Plus, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ApiError, api } from "../lib/api";
import { cn } from "../lib/utils";

type Step = "upload" | "map" | "preview" | "sequence";
const STEPS: Step[] = ["upload", "map", "preview", "sequence"];

export function NewCampaign() {
  const { id: idStr } = useParams<{ id: string }>();
  const id = Number(idStr);
  const [params, setParams] = useSearchParams();
  const step = (params.get("step") as Step) || "upload";
  const navigate = useNavigate();

  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({ email: "", custom: [] });
  const [importedCount, setImportedCount] = useState<ImportResult | null>(null);
  const [sequence, setSequence] = useState<
    Array<{
      id?: number;
      order: number;
      subjectTpl: string;
      bodyTpl: string;
      delayDays: number;
      defaultTemplateId: number | null;
    }>
  >([{ order: 1, subjectTpl: "", bodyTpl: "", delayDays: 0, defaultTemplateId: null }]);
  const [templates, setTemplates] = useState<TemplateDTO[]>([]);
  const [launching, setLaunching] = useState(false);
  const [originalHeaders, setOriginalHeaders] = useState<string[]>([]);
  const [segmentColumn, setSegmentColumn] = useState<string | null>(null);
  const [segmentValues, setSegmentValues] = useState<Array<{ value: string; count: number }>>([]);
  const [segmentRules, setSegmentRules] = useState<Record<string, Record<string, number>>>({});

  useEffect(() => {
    api.templates.list().then(setTemplates).catch(() => undefined);
    api.campaigns.getSteps(id).then((s) => {
      if (s.length > 0) {
        setSequence(
          s.map((x) => ({
            id: x.id,
            order: x.order,
            subjectTpl: x.subjectTpl,
            bodyTpl: x.bodyTpl,
            delayDays: x.delayDays,
            defaultTemplateId: x.defaultTemplateId,
          })),
        );
      }
    }).catch(() => undefined);
    api.campaigns.get(id).then((c) => {
      if (c.columnMapping) setMapping(c.columnMapping);
    }).catch(() => undefined);
    api.campaigns.getSegments(id).then((s) => {
      setOriginalHeaders(s.headers);
      setSegmentColumn(s.segmentColumn);
      setSegmentValues(s.uniqueValues);
      if (s.segmentColumn) setMapping((m) => ({ ...m, segmentColumn: s.segmentColumn ?? undefined }));
      const byStep: Record<string, Record<string, number>> = {};
      for (const st of s.steps) {
        byStep[String(st.id)] = {};
        for (const r of st.rules) byStep[String(st.id)]![r.segmentValue] = r.templateId;
      }
      setSegmentRules(byStep);
      if (!preview && s.headers.length > 0) {
        setPreview({ headers: s.headers, sampleRows: [], totalRows: 0 });
      }
    }).catch(() => undefined);
  }, [id]);

  async function refreshUniqueValues(col: string | null) {
    setSegmentColumn(col);
    if (!col) {
      setSegmentValues([]);
      return;
    }
    try {
      const r = await api.campaigns.getSegments(id, col);
      setSegmentValues(r.uniqueValues);
    } catch {
      setSegmentValues([]);
    }
  }

  useEffect(() => {
    const col = mapping.segmentColumn ?? null;
    if (col !== segmentColumn) refreshUniqueValues(col);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapping.segmentColumn]);

  function goTo(s: Step) {
    setParams({ step: s });
  }

  async function persistStepsAndSegments() {
    const oldStepIds = sequence.map((s) => s.id);
    const saved = await api.campaigns.putSteps(
      id,
      sequence.map((s) => ({
        order: s.order,
        subjectTpl: s.subjectTpl,
        bodyTpl: s.bodyTpl,
        delayDays: s.delayDays,
        defaultTemplateId: s.defaultTemplateId ?? null,
      })),
    );
    const oldToNew = new Map<number, number>();
    oldStepIds.forEach((old, i) => {
      const newStep = saved[i];
      if (old !== undefined && newStep) oldToNew.set(old, newStep.id);
    });
    const rules: Array<{ stepId: number; segmentValue: string; templateId: number }> = [];
    if (segmentColumn) {
      saved.forEach((newStep, idx) => {
        const old = oldStepIds[idx];
        const mapForStep =
          (old !== undefined && segmentRules[String(old)]) ||
          segmentRules[String(newStep.id)] ||
          segmentRules[`new_${idx}`] ||
          {};
        for (const [segVal, tplId] of Object.entries(mapForStep)) {
          rules.push({ stepId: newStep.id, segmentValue: segVal, templateId: tplId });
        }
      });
    }
    await api.campaigns.putSegments(id, {
      segmentColumn: segmentColumn || null,
      rules,
    });
    setSequence(
      saved.map((x) => ({
        id: x.id,
        order: x.order,
        subjectTpl: x.subjectTpl,
        bodyTpl: x.bodyTpl,
        delayDays: x.delayDays,
        defaultTemplateId: x.defaultTemplateId,
      })),
    );
    const newRules: Record<string, Record<string, number>> = {};
    for (const r of rules) {
      if (!newRules[String(r.stepId)]) newRules[String(r.stepId)] = {};
      newRules[String(r.stepId)]![r.segmentValue] = r.templateId;
    }
    setSegmentRules(newRules);
  }

  async function onLaunch() {
    setLaunching(true);
    try {
      await persistStepsAndSegments();
      const res = await api.campaigns.launch(id);
      toast.success(`Launched — ${res.enqueued} leads queued`);
      navigate(`/campaigns/${id}`);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `${err.code}: ${JSON.stringify(err.details ?? {})}`
          : "Launch failed";
      toast.error(msg);
    } finally {
      setLaunching(false);
    }
  }

  async function onSaveDraft() {
    try {
      await persistStepsAndSegments();
      toast.success("Draft saved");
      navigate(`/campaigns/${id}`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.code : "Save failed";
      toast.error(msg);
    }
  }

  const stepIdx = STEPS.indexOf(step);
  const hasCampaignData = Boolean(preview || importedCount || mapping.email || sequence.some((s) => s.id !== undefined));

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div className="flex items-center gap-2">
        <button className="btn" onClick={() => navigate("/")}>
          <ArrowLeft size={14} /> Back
        </button>
        <div className="text-ink-secondary text-small">Campaign #{id}</div>
      </div>

      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <button
              className={cn(
                "px-3 py-1.5 rounded-pill text-small transition-colors",
                i < stepIdx ? "bg-success-bg text-success-fg hover:bg-success-bg/80" :
                i === stepIdx ? "bg-ink-primary text-white" :
                "bg-surface-tertiary text-ink-secondary hover:bg-surface-secondary",
              )}
              onClick={() => goTo(s)}
              disabled={i > 0 && !hasCampaignData}
              title={i > 0 && !hasCampaignData ? "Upload a file first" : ""}
            >
              {i + 1}. {s}
            </button>
            {i < STEPS.length - 1 && <ArrowRight size={12} className="text-ink-tertiary" />}
          </div>
        ))}
      </div>

      {step === "upload" && (
        <UploadStep
          campaignId={id}
          onDone={(pv) => {
            setPreview(pv);
            const guessed = guessMapping(pv.headers);
            setMapping(guessed);
            goTo("map");
          }}
        />
      )}
      {step === "map" && (
        <MapStep
          preview={preview}
          mapping={mapping}
          onMappingChange={setMapping}
          onNext={() => { setImportedCount(null); goTo("preview"); }}
          onBack={() => goTo("upload")}
        />
      )}
      {step === "preview" && (
        <PreviewStep
          campaignId={id}
          preview={preview}
          mapping={mapping}
          imported={importedCount}
          onImport={async () => {
            try {
              const res = await api.campaigns.import(id, mapping);
              setImportedCount(res);
              toast.success(`${res.imported} leads imported, ${res.skipped} skipped, ${res.preReplied} pre-replied`);
              if (mapping.segmentColumn) await refreshUniqueValues(mapping.segmentColumn);
            } catch (err) {
              const msg =
                err instanceof ApiError
                  ? `${err.code}: ${JSON.stringify(err.details ?? {})}`
                  : "Import failed";
              toast.error(msg);
            }
          }}
          onBack={() => goTo("map")}
          onNext={() => goTo("sequence")}
        />
      )}
      {step === "sequence" && (
        <SequenceStepPanel
          steps={sequence}
          onChange={setSequence}
          templates={templates}
          onSaveDraft={onSaveDraft}
          onLaunch={onLaunch}
          launching={launching}
          onBack={() => goTo("preview")}
          segmentColumn={segmentColumn}
          segmentValues={segmentValues}
          segmentRules={segmentRules}
          onSegmentRulesChange={setSegmentRules}
        />
      )}
    </div>
  );
}

function guessMapping(headers: string[]): ColumnMapping {
  const lc = (s: string) => s.toLowerCase();
  const findBy = (test: (lc: string) => boolean) => headers.find((h) => test(lc(h)));
  const emailAddr = findBy((x) => x === "email" || x === "email address" || x.endsWith(" email") || x.startsWith("email "));
  return {
    email: emailAddr ?? findBy((x) => x.includes("email") && !x.includes("sent")) ?? "",
    firstName: findBy((x) => x.includes("first name") || x.includes("firstname") || x.includes("first_name")) ?? undefined,
    lastName: findBy((x) => x.includes("last name") || x.includes("lastname") || x.includes("last_name")) ?? undefined,
    company: findBy((x) => x.includes("company") || x.includes("organization")) ?? undefined,
    jobTitle: findBy((x) => x === "title" || x === "role" || x.includes("position") || x.includes("job title")) ?? undefined,
    replyStatus: findBy((x) => x.includes("response") || x.includes("replied") || x.includes("reply")) ?? undefined,
    emailSentStatus: findBy((x) => x.includes("email sent") || x.includes("email_sent") || x.includes("sent?")) ?? undefined,
    segmentColumn: findBy((x) => x === "category" || x === "industry" || x === "segment" || x.includes("list")) ?? undefined,
    custom: [],
  };
}

function UploadStep({
  campaignId,
  onDone,
}: {
  campaignId: number;
  onDone: (pv: UploadPreview) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const pv = await api.campaigns.upload(campaignId, file);
        toast.success(`Parsed ${pv.totalRows} rows`);
        onDone(pv);
      } catch (err) {
        const msg = err instanceof ApiError ? err.code : "Upload failed";
        toast.error(msg);
      } finally {
        setUploading(false);
      }
    },
    [campaignId, onDone],
  );

  return (
    <div
      className={cn(
        "card p-8 text-center border-2 border-dashed transition-colors",
        dragging ? "border-ink-primary bg-surface-tertiary" : "",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) upload(file);
      }}
    >
      <Upload size={28} className="mx-auto text-ink-tertiary mb-3" />
      <div className="text-h2">Drop an Excel file</div>
      <div className="text-small text-ink-secondary mt-1">
        .xlsx — one row per lead, one column for email address
      </div>
      <div className="mt-4">
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
          }}
        />
        <button
          className="btn btn-primary"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Uploading…" : "Choose file"}
        </button>
      </div>
    </div>
  );
}

function MapStep({
  preview,
  mapping,
  onMappingChange,
  onBack,
  onNext,
}: {
  preview: UploadPreview | null;
  mapping: ColumnMapping;
  onMappingChange: (m: ColumnMapping) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  if (!preview) {
    return <div className="card p-6 text-small text-ink-secondary">Upload a file first.</div>;
  }

  const used = useMemo(() => {
    const s = new Set<string>();
    if (mapping.email) s.add(mapping.email);
    if (mapping.firstName) s.add(mapping.firstName);
    if (mapping.lastName) s.add(mapping.lastName);
    if (mapping.company) s.add(mapping.company);
    if (mapping.jobTitle) s.add(mapping.jobTitle);
    if (mapping.replyStatus) s.add(mapping.replyStatus);
    if (mapping.emailSentStatus) s.add(mapping.emailSentStatus);
    if (mapping.segmentColumn) s.add(mapping.segmentColumn);
    for (const c of mapping.custom) s.add(c);
    return s;
  }, [mapping]);

  function setField(
    key: "email" | "firstName" | "lastName" | "company" | "jobTitle" | "replyStatus" | "emailSentStatus" | "segmentColumn",
    value: string,
  ) {
    onMappingChange({ ...mapping, [key]: value || undefined });
  }

  function toggleCustom(header: string) {
    const has = mapping.custom.includes(header);
    onMappingChange({
      ...mapping,
      custom: has ? mapping.custom.filter((h) => h !== header) : [...mapping.custom, header],
    });
  }

  const unused = preview.headers.filter((h) => !used.has(h));

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <div className="text-h2">Map columns</div>
        <div className="text-small text-ink-secondary">
          Choose which column of your sheet maps to each lead field. Email is required.
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MapField label="Email *" value={mapping.email} options={preview.headers} onChange={(v) => setField("email", v)} required />
          <MapField label="First name" value={mapping.firstName ?? ""} options={preview.headers} onChange={(v) => setField("firstName", v)} />
          <MapField label="Last name" value={mapping.lastName ?? ""} options={preview.headers} onChange={(v) => setField("lastName", v)} />
          <MapField label="Company" value={mapping.company ?? ""} options={preview.headers} onChange={(v) => setField("company", v)} />
          <MapField label="Job title" value={mapping.jobTitle ?? ""} options={preview.headers} onChange={(v) => setField("jobTitle", v)} />
          <MapField
            label="Reply status (yes/no — skips sending if yes, filled to 'yes' on export when lead replies)"
            value={mapping.replyStatus ?? ""}
            options={preview.headers}
            onChange={(v) => setField("replyStatus", v)}
          />
          <MapField
            label="Email sent status (yes/no — filled to 'yes' on export after we send)"
            value={mapping.emailSentStatus ?? ""}
            options={preview.headers}
            onChange={(v) => setField("emailSentStatus", v)}
          />
          <MapField
            label="Segment column (decides which template each lead receives)"
            value={mapping.segmentColumn ?? ""}
            options={preview.headers}
            onChange={(v) => setField("segmentColumn", v)}
          />
        </div>
        <div className="text-small text-ink-secondary pt-1">
          On export, every column of your original sheet is preserved. Reply/Email-sent columns are
          overwritten with <code className="text-ink-primary">yes</code> after the campaign runs.
          <br />
          The Segment column groups your leads — in the next step you'll pick a saved template per
          unique value in this column.
        </div>
      </div>

      <div className="card p-4 space-y-2">
        <div className="text-h2">Custom fields</div>
        <div className="text-small text-ink-secondary">
          Select additional columns to store alongside each lead. Use them in templates as{" "}
          <code className="text-ink-primary">{'{{custom.column_name}}'}</code>.
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {unused.map((h) => (
            <button
              key={h}
              type="button"
              className={cn(
                "badge cursor-pointer border",
                mapping.custom.includes(h) ? "bg-info-bg text-info-fg" : "bg-surface-secondary text-ink-secondary",
              )}
              onClick={() => toggleCustom(h)}
            >
              {mapping.custom.includes(h) ? "✓ " : "+ "}
              {h}
            </button>
          ))}
          {unused.length === 0 && (
            <div className="text-small text-ink-tertiary">No unmapped columns.</div>
          )}
        </div>
      </div>

      <div className="flex justify-between">
        <button className="btn" onClick={onBack}>
          <ArrowLeft size={14} /> Back
        </button>
        <button className="btn btn-primary" onClick={onNext} disabled={!mapping.email}>
          Continue <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

function MapField({
  label,
  value,
  options,
  onChange,
  required,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-small text-ink-secondary">{label}</span>
      <select
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      >
        <option value="">— none —</option>
        {options.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </label>
  );
}

function PreviewStep({
  preview,
  mapping,
  imported,
  onImport,
  onBack,
  onNext,
}: {
  campaignId: number;
  preview: UploadPreview | null;
  mapping: ColumnMapping;
  imported: ImportResult | null;
  onImport: () => Promise<void>;
  onBack: () => void;
  onNext: () => void;
}) {
  const [importing, setImporting] = useState(false);
  if (!preview) return <div className="card p-6 text-small text-ink-secondary">Upload a file first.</div>;

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-2">
        <div className="text-h2">Preview</div>
        <div className="text-small text-ink-secondary">
          First {preview.sampleRows.length} of {preview.totalRows} rows. Import commits all rows.
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-small">
            <thead className="bg-surface-secondary text-ink-secondary">
              <tr>
                {preview.headers.map((h) => (
                  <th key={h} className="px-2 py-1 text-left font-medium">
                    {h}
                    {mapping.email === h && <span className="badge bg-info-bg text-info-fg ml-2">email</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.sampleRows.map((row, i) => (
                <tr key={i} className="border-t">
                  {preview.headers.map((h) => (
                    <td key={h} className="px-2 py-1 whitespace-nowrap">
                      {row[h] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {imported ? (
        <div className="space-y-2">
          <div
            className={`card p-4 ${
              imported.imported > 0 ? "bg-success-bg text-success-fg" : "bg-warning-bg text-warning-fg"
            }`}
          >
            {imported.imported > 0 ? "✓ " : "⚠ "}
            Imported {imported.imported} · {imported.skipped} skipped · {imported.preReplied} already replied
          </div>
          {imported.skipReasons && imported.skipReasons.length > 0 && (
            <div className="card p-4 space-y-2">
              <div className="text-small text-ink-secondary">
                Skipped rows (first {imported.skipReasons.length}):
              </div>
              <table className="w-full text-small">
                <thead className="text-ink-tertiary">
                  <tr>
                    <th className="text-left font-medium">Row</th>
                    <th className="text-left font-medium">Raw email cell</th>
                    <th className="text-left font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {imported.skipReasons.map((s, i) => (
                    <tr key={i} className="border-t">
                      <td className="py-1">{s.row}</td>
                      <td className="py-1 font-mono text-ink-secondary">
                        {s.rawEmail || <em className="text-ink-tertiary">(blank)</em>}
                      </td>
                      <td className="py-1">{s.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-small text-ink-tertiary">
                Check step 2 (Map) — the Email dropdown probably points at the wrong column.
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex justify-end">
          <button
            className="btn btn-primary"
            disabled={importing || !mapping.email}
            onClick={async () => {
              setImporting(true);
              try {
                await onImport();
              } finally {
                setImporting(false);
              }
            }}
          >
            {importing ? "Importing…" : "Import leads"}
          </button>
        </div>
      )}

      <div className="flex justify-between">
        <button className="btn" onClick={onBack}>
          <ArrowLeft size={14} /> Back
        </button>
        <button className="btn btn-primary" onClick={onNext} disabled={!imported}>
          Continue <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

function SequenceStepPanel({
  steps,
  onChange,
  templates,
  onSaveDraft,
  onLaunch,
  launching,
  onBack,
  segmentColumn,
  segmentValues,
  segmentRules,
  onSegmentRulesChange,
}: {
  steps: Array<{
    id?: number;
    order: number;
    subjectTpl: string;
    bodyTpl: string;
    delayDays: number;
    defaultTemplateId: number | null;
  }>;
  onChange: (s: typeof steps) => void;
  templates: TemplateDTO[];
  onSaveDraft: () => void;
  onLaunch: () => void;
  launching: boolean;
  onBack: () => void;
  segmentColumn: string | null;
  segmentValues: Array<{ value: string; count: number }>;
  segmentRules: Record<string, Record<string, number>>;
  onSegmentRulesChange: (r: Record<string, Record<string, number>>) => void;
}) {
  function stepKey(idx: number, step: { id?: number }): string {
    return step.id !== undefined ? String(step.id) : `new_${idx}`;
  }

  function setRule(stepId: string, segmentValue: string, templateId: number | null) {
    const next: Record<string, Record<string, number>> = { ...segmentRules };
    const bucket = { ...(next[stepId] ?? {}) };
    if (templateId == null) delete bucket[segmentValue];
    else bucket[segmentValue] = templateId;
    next[stepId] = bucket;
    onSegmentRulesChange(next);
  }
  function addStep() {
    onChange([
      ...steps,
      { order: steps.length + 1, subjectTpl: "", bodyTpl: "", delayDays: 3, defaultTemplateId: null },
    ]);
  }

  function updateStep(
    idx: number,
    patch: Partial<{ delayDays: number; defaultTemplateId: number | null }>,
  ) {
    onChange(steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function removeStep(idx: number) {
    if (steps.length === 1) return;
    onChange(steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 })));
  }

  const noTemplates = templates.length === 0;
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      

      {segmentColumn && (
        <div className="card p-4 space-y-2">
          <div className="text-h2">Segmentation · column "{segmentColumn}"</div>
          <div className="text-small text-ink-secondary">
            Each step below lets you assign a template per unique value of{" "}
            <code className="text-ink-primary">{segmentColumn}</code>. Leads whose value has no rule
            use the step's <em>default template</em>.
          </div>
          {segmentValues.length === 0 ? (
            <div className="text-small text-ink-tertiary">
              No non-empty values found in this column. Either pick a different column in step 2
              (Map), or leave segmentation off and set the default template per step.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {segmentValues.map((v) => (
                <span key={v.value} className="badge bg-surface-secondary text-ink-secondary">
                  {v.value} <span className="text-ink-tertiary">· {v.count}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        {steps.map((s, i) => (
          <div key={i} className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-h2">Step {s.order}</div>
              {steps.length > 1 && (
                <button className="btn text-ink-secondary" onClick={() => removeStep(i)}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            {i > 0 && (
              <label className="block space-y-1">
                <span className="text-small text-ink-secondary">
                  Delay after previous step (days)
                </span>
                <input
                  type="number"
                  min={0}
                  className="input w-32"
                  value={s.delayDays}
                  onChange={(e) => updateStep(i, { delayDays: Number(e.target.value) })}
                />
              </label>
            )}

            <label className="block space-y-1">
              <span className="text-small text-ink-secondary">
                
                {noTemplates && (
        <div className="card p-4 flex items-center justify-between gap-4">
          <span className="text-small text-ink-secondary">No templates yet. Add one first.</span>
          <button className="btn btn-primary shrink-0" onClick={() => navigate("/templates")}>
            Add template
          </button>
        </div>
      )}
              </span>
              <select
                className="input max-w-md"
                value={s.defaultTemplateId ?? ""}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  updateStep(i, { defaultTemplateId: v || null });
                }}
                disabled={noTemplates}
              >
                
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {s.defaultTemplateId && (
                <TemplatePreview tpl={templates.find((t) => t.id === s.defaultTemplateId) ?? null} />
              )}
            </label>

            {segmentColumn && segmentValues.length > 0 && !noTemplates && (
              <div className="pt-2 border-t space-y-2">
                <div className="text-small text-ink-secondary">
                  Per-category template overrides
                </div>
                <table className="w-full text-small">
                  <thead className="text-ink-tertiary">
                    <tr>
                      <th className="text-left font-medium py-1">{segmentColumn} =</th>
                      <th className="text-left font-medium py-1">Count</th>
                      <th className="text-left font-medium py-1">Template</th>
                    </tr>
                  </thead>
                  <tbody>
                    {segmentValues.map((v) => {
                      const k = stepKey(i, s);
                      const selected = segmentRules[k]?.[v.value] ?? "";
                      return (
                        <tr key={v.value} className="border-t">
                          <td className="py-1 pr-2 font-mono">{v.value}</td>
                          <td className="py-1 pr-2 text-ink-tertiary">{v.count}</td>
                          <td className="py-1">
                            <select
                              className="input"
                              value={selected}
                              onChange={(e) => {
                                const tplId = Number(e.target.value);
                                setRule(k, v.value, tplId || null);
                              }}
                            >
                              <option value="">— use default —</option>
                              {templates.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
      <button className="btn" onClick={addStep}>
        <Plus size={14} /> Add follow-up
      </button>

      <div className="flex justify-between gap-2 pt-2">
        <button className="btn" onClick={onBack}>
          <ArrowLeft size={14} /> Back
        </button>
        <div className="flex gap-2">
          <button className="btn" onClick={onSaveDraft} disabled={launching}>
            Save draft
          </button>
          <button className="btn btn-primary" onClick={onLaunch} disabled={launching}>
            {launching ? "Launching…" : "Launch campaign"}
          </button>
        </div>
      </div>
    </div>
  );
}


function TemplatePreview({ tpl }: { tpl: TemplateDTO | null }) {
  if (!tpl) return null;
  return (
    <div className="mt-2 rounded-card border bg-surface-secondary p-3 space-y-1 text-small">
      <div className="text-ink-tertiary">Preview</div>
      <div className="text-ink-primary font-medium">{tpl.subject}</div>
      <pre className="whitespace-pre-wrap font-mono text-tiny text-ink-secondary line-clamp-4">
        {tpl.body.slice(0, 300)}
        {tpl.body.length > 300 ? "…" : ""}
      </pre>
    </div>
  );
}
