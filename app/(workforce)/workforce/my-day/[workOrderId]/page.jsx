"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Loader2,
  MapPin,
  Save,
  ShieldCheck,
} from "lucide-react";
import captureDeviceLocation from "@/lib/shared/location/captureDeviceLocation";

function fieldsFromProtocol(protocol = {}) {
  if (Array.isArray(protocol.field_schema)) return protocol.field_schema;
  return Array.isArray(protocol.field_schema?.fields)
    ? protocol.field_schema.fields
    : [];
}

function evidenceRequirements(protocol = {}) {
  if (Array.isArray(protocol.evidence_requirements)) {
    return protocol.evidence_requirements;
  }
  return Array.isArray(protocol.evidence_requirements?.requirements)
    ? protocol.evidence_requirements.requirements
    : [];
}

function keyFor(item = {}, index = 0) {
  return String(item.id || item.key || item.name || `field-${index}`);
}

function labelFor(item = {}, fallback = "Field") {
  return item.label || item.title || item.name || fallback;
}

function FieldInput({ field, fieldKey, value, onChange }) {
  const type = String(field.type || field.input_type || "text").toLowerCase();
  const common =
    "mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-base text-white outline-none focus:border-cyan-300/40";

  if (type === "textarea" || type === "notes" || type === "long_text") {
    return (
      <textarea
        rows={4}
        value={value ?? ""}
        onChange={(event) => onChange(fieldKey, event.target.value)}
        className={common}
      />
    );
  }

  if (type === "boolean" || type === "checkbox") {
    return (
      <button
        type="button"
        onClick={() => onChange(fieldKey, !Boolean(value))}
        className={`mt-2 flex h-12 w-full items-center justify-between rounded-2xl border px-4 text-sm font-black ${
          value
            ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
            : "border-white/10 bg-black/25 text-white/55"
        }`}
      >
        <span>{value ? "Yes" : "No"}</span>
        {value ? <CheckCircle2 className="h-5 w-5" /> : null}
      </button>
    );
  }

  if (type === "select" || type === "choice") {
    const options = Array.isArray(field.options) ? field.options : [];
    return (
      <select
        value={value ?? ""}
        onChange={(event) => onChange(fieldKey, event.target.value)}
        className={common}
      >
        <option value="">Select</option>
        {options.map((option) => {
          const optionValue =
            typeof option === "object" ? option.value ?? option.id : option;
          const optionLabel =
            typeof option === "object" ? option.label ?? option.name ?? optionValue : option;
          return (
            <option key={String(optionValue)} value={String(optionValue)}>
              {optionLabel}
            </option>
          );
        })}
      </select>
    );
  }

  const htmlType = ["number", "date", "time"].includes(type) ? type : "text";
  return (
    <input
      type={htmlType}
      value={value ?? ""}
      onChange={(event) =>
        onChange(
          fieldKey,
          htmlType === "number" && event.target.value !== ""
            ? Number(event.target.value)
            : event.target.value
        )
      }
      className={common}
    />
  );
}

export default function ServiceExecutionPage() {
  const params = useParams();
  const router = useRouter();
  const workOrderId = params?.workOrderId;
  const [execution, setExecution] = useState(null);
  const [responses, setResponses] = useState({});
  const [outcome, setOutcome] = useState({});
  const [followUp, setFollowUp] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [uploading, setUploading] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function loadExecution() {
    if (!workOrderId) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/staff/service-execution?workOrderId=${encodeURIComponent(workOrderId)}`,
        { cache: "no-store" }
      );
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Unable to load this job.");
      }
      setExecution(data);
      setResponses(data.report?.field_responses || {});
      setOutcome(data.report?.outcome || {});
      setFollowUp(data.report?.follow_up || {});
    } catch (loadError) {
      setError(loadError?.message || "Unable to load this job.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadExecution();
  }, [workOrderId]);

  const protocol = execution?.protocol || {};
  const fields = useMemo(() => fieldsFromProtocol(protocol), [protocol]);
  const evidenceRules = useMemo(() => evidenceRequirements(protocol), [protocol]);
  const evidence = execution?.report?.evidence || [];
  const service = execution?.workOrder?.attributes?.service_delivery || {};

  function changeField(key, value) {
    setSaved(false);
    setResponses((current) => ({ ...current, [key]: value }));
  }

  async function saveDraft() {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const response = await fetch("/api/staff/service-execution", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workOrderId,
          fieldResponses: responses,
          outcome,
          followUp,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Unable to save progress.");
      }
      setExecution((current) => ({ ...current, report: data.report }));
      setSaved(true);
    } catch (saveError) {
      setError(saveError?.message || "Unable to save progress.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadEvidence(requirement, file) {
    if (!file) return;
    const requirementId = keyFor(requirement);
    setUploading(requirementId);
    setError("");
    try {
      const form = new FormData();
      form.append("workOrderId", workOrderId);
      form.append("requirementId", requirementId);
      form.append("category", requirement.type || requirement.category || "evidence");
      form.append("file", file);

      const response = await fetch("/api/staff/service-execution/evidence", {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Unable to upload evidence.");
      }
      setExecution((current) => ({ ...current, report: data.report }));
    } catch (uploadError) {
      setError(uploadError?.message || "Unable to upload evidence.");
    } finally {
      setUploading("");
    }
  }

  async function completeJob() {
    setCompleting(true);
    setError("");
    try {
      const location = await captureDeviceLocation();
      const response = await fetch("/api/staff/service-execution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workOrderId,
          fieldResponses: responses,
          outcome,
          followUp,
          location,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        const detail = Array.isArray(data?.validationErrors)
          ? data.validationErrors.join(" ")
          : "";
        throw new Error(detail || data?.error || "Unable to complete job.");
      }
      router.push("/workforce/my-day");
      router.refresh();
    } catch (completeError) {
      setError(completeError?.message || "Unable to complete job.");
    } finally {
      setCompleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-cyan-300" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => router.push("/workforce/my-day")}
        className="flex items-center gap-2 text-sm font-bold text-white/55"
      >
        <ArrowLeft className="h-4 w-4" /> My Day
      </button>

      <section className="rounded-[32px] border border-cyan-400/20 bg-cyan-400/[0.06] p-5">
        <div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300">
          {protocol.name || service.service_name || "Job execution"}
        </div>
        <h1 className="mt-2 text-2xl font-black">
          {service.customer_name || execution?.workOrder?.name || "Assigned work"}
        </h1>
        {service.customer_location_name ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-white/45">
            <MapPin className="h-4 w-4" /> {service.customer_location_name}
          </div>
        ) : null}
        {protocol.instructions ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/60">
            {protocol.instructions}
          </div>
        ) : null}
        {protocol.version ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-white/35">
            <ShieldCheck className="h-4 w-4" /> Protocol version {protocol.version} pinned to this visit
          </div>
        ) : null}
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {fields.length ? (
        <section className="space-y-3">
          <div className="px-1 text-xs font-black uppercase tracking-[0.2em] text-white/35">
            Work checklist
          </div>
          {fields.map((field, index) => {
            const fieldKey = keyFor(field, index);
            return (
              <div key={fieldKey} className="rounded-[26px] border border-white/10 bg-white/[0.045] p-4">
                <label className="text-sm font-black text-white/80">
                  {labelFor(field, `Field ${index + 1}`)}
                  {field.required ? <span className="ml-1 text-amber-300">*</span> : null}
                </label>
                {field.help_text || field.description ? (
                  <div className="mt-1 text-xs leading-5 text-white/35">
                    {field.help_text || field.description}
                  </div>
                ) : null}
                <FieldInput
                  field={field}
                  fieldKey={fieldKey}
                  value={responses[fieldKey]}
                  onChange={changeField}
                />
              </div>
            );
          })}
        </section>
      ) : null}

      {evidenceRules.length ? (
        <section className="space-y-3">
          <div className="px-1 text-xs font-black uppercase tracking-[0.2em] text-white/35">
            Evidence
          </div>
          {evidenceRules.map((requirement, index) => {
            const requirementId = keyFor(requirement, index);
            const uploaded = evidence.filter(
              (item) => item.requirement_id === requirementId
            );
            return (
              <div key={requirementId} className="rounded-[26px] border border-white/10 bg-white/[0.045] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-white/80">
                      {labelFor(requirement, "Evidence")}
                      {requirement.required ? <span className="ml-1 text-amber-300">*</span> : null}
                    </div>
                    <div className="mt-1 text-xs text-white/35">
                      {uploaded.length ? `${uploaded.length} file${uploaded.length === 1 ? "" : "s"} uploaded` : "No evidence uploaded yet"}
                    </div>
                  </div>
                  <label className="flex h-11 cursor-pointer items-center gap-2 rounded-2xl bg-white/[0.08] px-4 text-xs font-black uppercase tracking-[0.1em] text-white">
                    {uploading === requirementId ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                    Add
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      capture={String(requirement.type || "").toLowerCase().includes("photo") ? "environment" : undefined}
                      className="hidden"
                      disabled={Boolean(uploading)}
                      onChange={(event) => uploadEvidence(requirement, event.target.files?.[0])}
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </section>
      ) : null}

      <section className="space-y-3 rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
        <div className="text-xs font-black uppercase tracking-[0.2em] text-white/35">Findings & follow-up</div>
        <textarea
          rows={3}
          value={outcome.findings || ""}
          onChange={(event) => {
            setSaved(false);
            setOutcome((current) => ({ ...current, findings: event.target.value }));
          }}
          placeholder="Findings, issues, customer notes..."
          className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-base text-white outline-none focus:border-cyan-300/40"
        />
        <textarea
          rows={2}
          value={followUp.notes || ""}
          onChange={(event) => {
            setSaved(false);
            setFollowUp((current) => ({ ...current, notes: event.target.value }));
          }}
          placeholder="Recommended follow-up..."
          className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-base text-white outline-none focus:border-cyan-300/40"
        />
      </section>

      <div className="grid grid-cols-2 gap-2 pb-4">
        <button
          type="button"
          onClick={saveDraft}
          disabled={saving || completing}
          className="flex h-14 items-center justify-center gap-2 rounded-[22px] border border-white/10 bg-white/[0.06] text-sm font-black text-white disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saved ? "Saved" : "Save"}
        </button>
        <button
          type="button"
          onClick={completeJob}
          disabled={saving || completing}
          className="flex h-14 items-center justify-center gap-2 rounded-[22px] bg-gradient-to-r from-emerald-500 to-cyan-500 text-sm font-black text-white disabled:opacity-40"
        >
          {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Complete
        </button>
      </div>
    </div>
  );
}
