"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

const FIELD_TYPES = [
  ["text", "Text"],
  ["textarea", "Long Text"],
  ["number", "Number"],
  ["measurement", "Measurement"],
  ["select", "Select"],
  ["checkbox", "Checkbox"],
  ["date", "Date"],
  ["datetime", "Date & Time"],
  ["photo", "Photo"],
  ["signature", "Signature"],
  ["file", "File"],
];

const EMPTY_FIELD = Object.freeze({
  section: "Service",
  label: "",
  key: "",
  type: "text",
  required: false,
  help_text: "",
  unit: "",
  options_text: "",
});

const EMPTY_FORM = Object.freeze({
  name: "",
  code: "",
  industry_key: "generic-service",
  description: "",
  instructions: "",
  before_photos: false,
  after_photos: false,
  customer_signature: false,
  technician_signature: false,
  location_confirmation: false,
});

function slug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function FieldEditor({ field, index, onChange, onRemove }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
          Field {index + 1}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-lg border border-red-400/15 px-2.5 py-1.5 text-[11px] text-red-200/70"
        >
          Remove
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-white/45">
          Section
          <input
            value={field.section}
            onChange={(event) => onChange("section", event.target.value)}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-sm text-white"
            placeholder="Inspection"
          />
        </label>
        <label className="text-xs text-white/45">
          Field Type
          <select
            value={field.type}
            onChange={(event) => onChange("type", event.target.value)}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-sm text-white"
          >
            {FIELD_TYPES.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-white/45">
          Label
          <input
            value={field.label}
            onChange={(event) => onChange("label", event.target.value)}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-sm text-white"
            placeholder="Pest activity"
            required
          />
        </label>
        <label className="text-xs text-white/45">
          Key
          <input
            value={field.key}
            onChange={(event) => onChange("key", slug(event.target.value))}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-sm text-white"
            placeholder="pest-activity"
            required
          />
        </label>
        {field.type === "measurement" ? (
          <label className="text-xs text-white/45">
            Unit
            <input
              value={field.unit}
              onChange={(event) => onChange("unit", event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-sm text-white"
              placeholder="ppm, °C, bar, ml..."
            />
          </label>
        ) : null}
        {field.type === "select" ? (
          <label className="text-xs text-white/45 sm:col-span-2">
            Options — one per line
            <textarea
              value={field.options_text}
              onChange={(event) => onChange("options_text", event.target.value)}
              className="mt-2 min-h-24 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-sm text-white"
              placeholder={"Low\nMedium\nHigh"}
            />
          </label>
        ) : null}
        <label className="text-xs text-white/45 sm:col-span-2">
          Help Text
          <input
            value={field.help_text}
            onChange={(event) => onChange("help_text", event.target.value)}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-sm text-white"
            placeholder="What should the technician check or record?"
          />
        </label>
      </div>

      <label className="mt-3 flex items-center gap-2 text-xs text-white/55">
        <input
          type="checkbox"
          checked={field.required}
          onChange={(event) => onChange("required", event.target.checked)}
        />
        Required before completion
      </label>
    </div>
  );
}

function EvidenceToggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-xs text-white/60">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

export default function ServiceExecutionTemplatesPage() {
  const params = useParams();
  const { organization, loading: organizationLoading } = useOrganizationRuntime();
  const organizationId = params?.organizationId || organization?.id || "";

  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [fields, setFields] = useState([{ ...EMPTY_FIELD }]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/service-management/execution-templates?organizationId=${encodeURIComponent(organizationId)}&status=all&limit=500`,
        { cache: "no-store" },
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        throw new Error(json.error || "Execution templates could not be loaded.");
      }
      setTemplates(json.rows || []);
    } catch (loadError) {
      setError(loadError.message || "Execution templates could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  const activeTemplates = useMemo(
    () => templates.filter((template) => template.status === "active"),
    [templates],
  );

  function updateForm(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updateField(index, name, value) {
    setFields((current) => current.map((field, fieldIndex) => {
      if (fieldIndex !== index) return field;
      const next = { ...field, [name]: value };
      if (name === "label" && (!field.key || field.key === slug(field.label))) {
        next.key = slug(value);
      }
      return next;
    }));
  }

  function addField() {
    setFields((current) => [...current, { ...EMPTY_FIELD }]);
  }

  function removeField(index) {
    setFields((current) => current.filter((_, fieldIndex) => fieldIndex !== index));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const normalizedFields = fields.map((field) => ({
        section: field.section || "Service",
        label: field.label,
        key: field.key || slug(field.label),
        type: field.type,
        required: field.required,
        help_text: field.help_text || null,
        unit: field.unit || null,
        options: field.type === "select"
          ? field.options_text.split("\n").map((value) => value.trim()).filter(Boolean)
          : [],
      }));

      if (!form.name || normalizedFields.some((field) => !field.label || !field.key)) {
        throw new Error("Template name and every field label/key are required.");
      }

      const response = await fetch("/api/service-management/execution-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          name: form.name,
          code: form.code || slug(form.name),
          industry_key: form.industry_key || "generic-service",
          description: form.description || null,
          instructions: form.instructions || null,
          field_schema: normalizedFields,
          evidence_requirements: {
            before_photos: form.before_photos,
            after_photos: form.after_photos,
            customer_signature: form.customer_signature,
            technician_signature: form.technician_signature,
            location_confirmation: form.location_confirmation,
          },
          completion_rules: {
            allow_follow_up: true,
            require_outcome: true,
          },
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        throw new Error(json.error || "Execution template could not be created.");
      }

      setForm({ ...EMPTY_FORM });
      setFields([{ ...EMPTY_FIELD }]);
      setNotice(`Execution template ${json.row?.name || ""} v${json.row?.version || 1} created.`);
      await load();
    } catch (saveError) {
      setError(saveError.message || "Execution template could not be created.");
    } finally {
      setSaving(false);
    }
  }

  if (organizationLoading) {
    return <section className="mx-auto max-w-[1480px] px-5 py-10 text-white/45">Loading Service Protocols...</section>;
  }

  return (
    <section className="mx-auto max-w-[1480px] px-5 py-6 text-white">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9BCF53]">Service Management</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Execution Template Builder</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">
            Configure what a field worker must inspect, measure, photograph, sign and complete. These protocols are data-driven so one Service Delivery engine can support many industries without hardcoded technician screens.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/workspace/${encodeURIComponent(organizationId)}/operations/field-service`} className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2 text-sm text-white/60">Field Service</Link>
          <Link href={`/workspace/${encodeURIComponent(organizationId)}/operations/field-service/service-plans`} className="rounded-xl border border-[#9BCF53]/30 bg-[#9BCF53]/10 px-4 py-2 text-sm text-[#D9F4B7]">Service Plans</Link>
        </div>
      </div>

      {error ? <div className="mt-5 rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-200">{error}</div> : null}
      {notice ? <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.08] p-4 text-sm text-emerald-100">{notice}</div> : null}

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <form onSubmit={submit} className="rounded-[26px] border border-white/10 bg-white/[0.025] p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-white/45">
              Template Name
              <input value={form.name} onChange={(event) => { updateForm("name", event.target.value); if (!form.code || form.code === slug(form.name)) updateForm("code", slug(event.target.value)); }} className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-3 text-sm text-white" placeholder="Preventive Pest Treatment" required />
            </label>
            <label className="text-xs text-white/45">
              Code
              <input value={form.code} onChange={(event) => updateForm("code", slug(event.target.value))} className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-3 text-sm text-white" placeholder="preventive-pest-treatment" required />
            </label>
            <label className="text-xs text-white/45">
              Industry Key
              <input value={form.industry_key} onChange={(event) => updateForm("industry_key", slug(event.target.value))} className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-3 text-sm text-white" placeholder="pest-control" />
            </label>
            <label className="text-xs text-white/45 sm:col-span-2">
              Description
              <input value={form.description} onChange={(event) => updateForm("description", event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-3 text-sm text-white" placeholder="When and why this protocol is used" />
            </label>
            <label className="text-xs text-white/45 sm:col-span-2">
              Technician Instructions
              <textarea value={form.instructions} onChange={(event) => updateForm("instructions", event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-3 text-sm text-white" placeholder="Execution guidance shown to the field worker" />
            </label>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">Dynamic Fields</div>
              <div className="mt-1 text-xs text-white/35">Sections and field types define the technician execution form.</div>
            </div>
            <button type="button" onClick={addField} className="rounded-xl border border-[#9BCF53]/30 bg-[#9BCF53]/10 px-3 py-2 text-xs font-semibold text-[#D9F4B7]">+ Add Field</button>
          </div>

          <div className="mt-4 space-y-3">
            {fields.map((field, index) => (
              <FieldEditor
                key={`${index}-${field.key}`}
                field={field}
                index={index}
                onChange={(name, value) => updateField(index, name, value)}
                onRemove={() => removeField(index)}
              />
            ))}
          </div>

          <div className="mt-6">
            <div className="text-sm font-semibold text-white">Evidence Requirements</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <EvidenceToggle label="Before photos" checked={form.before_photos} onChange={(value) => updateForm("before_photos", value)} />
              <EvidenceToggle label="After photos" checked={form.after_photos} onChange={(value) => updateForm("after_photos", value)} />
              <EvidenceToggle label="Customer signature" checked={form.customer_signature} onChange={(value) => updateForm("customer_signature", value)} />
              <EvidenceToggle label="Technician signature" checked={form.technician_signature} onChange={(value) => updateForm("technician_signature", value)} />
              <EvidenceToggle label="Location confirmation" checked={form.location_confirmation} onChange={(value) => updateForm("location_confirmation", value)} />
            </div>
          </div>

          <button type="submit" disabled={saving || fields.length === 0} className="mt-6 w-full rounded-xl border border-[#9BCF53]/35 bg-[#9BCF53]/12 px-4 py-3 text-sm font-semibold text-[#D9F4B7] disabled:opacity-40">
            {saving ? "Creating Template..." : "Create Versioned Execution Template"}
          </button>
        </form>

        <div className="rounded-[26px] border border-white/10 bg-white/[0.025] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold">Protocol Library</div>
              <div className="mt-1 text-xs text-white/35">{activeTemplates.length} active · {templates.length} versions</div>
            </div>
            <button type="button" onClick={load} disabled={loading} className="rounded-xl border border-white/10 px-3 py-2 text-xs text-white/55">Refresh</button>
          </div>

          <div className="mt-5 space-y-3">
            {loading ? <div className="py-8 text-center text-sm text-white/35">Loading templates...</div> : null}
            {!loading && templates.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 p-5 text-sm leading-6 text-white/40">No execution templates yet. Build the first protocol here; Pest Control can be the first validation case, but the schema remains industry-neutral.</div> : null}
            {!loading && templates.map((template) => (
              <div key={template.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-white">{template.name}</div>
                    <div className="mt-1 text-[11px] text-white/35">{template.code} · v{template.version}</div>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] capitalize text-white/50">{template.status}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-white/45">
                  <span className="rounded-lg border border-white/10 px-2 py-1">{template.industry_key}</span>
                  <span className="rounded-lg border border-white/10 px-2 py-1">{Array.isArray(template.field_schema) ? template.field_schema.length : 0} fields</span>
                </div>
                {template.description ? <p className="mt-3 text-xs leading-5 text-white/40">{template.description}</p> : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
