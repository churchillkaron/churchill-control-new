"use client";

import { useState } from "react";
import { Camera, FileUp, Loader2, PenLine, ShieldCheck } from "lucide-react";

function updateNested(value, key, next) {
  return { ...(value || {}), [key]: next };
}

function inputClass() {
  return "mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-cyan-400/35";
}

function fieldValue(submission, field) {
  return submission?.fields?.[field.key] ?? (field.type === "checkbox" ? false : "");
}

export default function ServiceProtocolForm({ job, value = {}, onChange }) {
  const protocol = job?.executionProtocol;
  const [uploadingKey, setUploadingKey] = useState(null);
  const [uploadError, setUploadError] = useState("");

  if (!protocol) return null;

  const fields = Array.isArray(protocol.field_schema) ? protocol.field_schema : [];
  const requirements = protocol.evidence_requirements || {};
  const rules = protocol.completion_rules || {};
  const submission = {
    fields: value.fields || {},
    outcome: value.outcome || "",
    follow_up_notes: value.follow_up_notes || "",
    evidence: value.evidence || {},
  };

  function changeField(key, nextValue) {
    onChange({
      ...submission,
      fields: updateNested(submission.fields, key, nextValue),
    });
  }

  function changeEvidence(key, nextValue) {
    onChange({
      ...submission,
      evidence: updateNested(submission.evidence, key, nextValue),
    });
  }

  async function uploadEvidence(file, { evidenceType, fieldKey = null, targetKey = null }) {
    if (!file) return;
    const busyKey = fieldKey || targetKey || evidenceType;
    setUploadingKey(busyKey);
    setUploadError("");

    try {
      const formData = new FormData();
      formData.append("workOrderId", job.id);
      formData.append("evidenceType", evidenceType);
      if (fieldKey) formData.append("fieldKey", fieldKey);
      formData.append("file", file);

      const response = await fetch("/api/staff/my-day/evidence", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Evidence upload failed");
      }

      if (fieldKey) {
        changeField(fieldKey, data.evidence);
      } else if (targetKey) {
        const current = Array.isArray(submission.evidence?.[targetKey])
          ? submission.evidence[targetKey]
          : [];
        changeEvidence(targetKey, [...current, data.evidence]);
      }
    } catch (error) {
      setUploadError(error?.message || "Evidence upload failed");
    } finally {
      setUploadingKey(null);
    }
  }

  return (
    <div className="mt-4 rounded-[24px] border border-violet-400/20 bg-violet-400/[0.06] p-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" />
        <div>
          <div className="text-sm font-black">{protocol.name || "Service protocol"}</div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/35">
            Version {protocol.version || 1}
          </div>
          {protocol.instructions ? (
            <div className="mt-2 text-xs leading-relaxed text-white/45">{protocol.instructions}</div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {fields.map((field) => (
          <ProtocolField
            key={field.key}
            field={field}
            value={fieldValue(submission, field)}
            uploading={uploadingKey === field.key}
            onChange={(nextValue) => changeField(field.key, nextValue)}
            onFile={(file) =>
              uploadEvidence(file, {
                evidenceType: field.type === "photo" ? "protocol_photo" : "protocol_file",
                fieldKey: field.key,
              })
            }
          />
        ))}
      </div>

      {(requirements.before_photos || requirements.after_photos) ? (
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {requirements.before_photos ? (
            <EvidenceUpload
              label="Before photo"
              count={submission.evidence?.before_photos?.length || 0}
              uploading={uploadingKey === "before_photos"}
              onFile={(file) =>
                uploadEvidence(file, {
                  evidenceType: "before_photo",
                  targetKey: "before_photos",
                })
              }
            />
          ) : null}
          {requirements.after_photos ? (
            <EvidenceUpload
              label="After photo"
              count={submission.evidence?.after_photos?.length || 0}
              uploading={uploadingKey === "after_photos"}
              onFile={(file) =>
                uploadEvidence(file, {
                  evidenceType: "after_photo",
                  targetKey: "after_photos",
                })
              }
            />
          ) : null}
        </div>
      ) : null}

      {requirements.customer_signature ? (
        <label className="mt-4 block text-xs font-bold text-white/60">
          Customer signature / acknowledgement
          <div className="relative">
            <PenLine className="pointer-events-none absolute left-3 top-5 h-4 w-4 text-white/30" />
            <input
              value={submission.evidence?.customer_signature || ""}
              onChange={(event) => changeEvidence("customer_signature", event.target.value)}
              placeholder="Customer name or acknowledgement"
              className={`${inputClass()} pl-10`}
            />
          </div>
        </label>
      ) : null}

      {requirements.technician_signature ? (
        <label className="mt-4 block text-xs font-bold text-white/60">
          Technician signature / acknowledgement
          <div className="relative">
            <PenLine className="pointer-events-none absolute left-3 top-5 h-4 w-4 text-white/30" />
            <input
              value={submission.evidence?.technician_signature || ""}
              onChange={(event) => changeEvidence("technician_signature", event.target.value)}
              placeholder="Technician name or acknowledgement"
              className={`${inputClass()} pl-10`}
            />
          </div>
        </label>
      ) : null}

      {rules.require_outcome !== false ? (
        <label className="mt-4 block text-xs font-bold text-white/60">
          Service outcome
          <select
            value={submission.outcome}
            onChange={(event) => onChange({ ...submission, outcome: event.target.value })}
            className={inputClass()}
          >
            <option value="">Select outcome</option>
            <option value="completed">Completed successfully</option>
            <option value="follow_up" disabled={rules.allow_follow_up === false}>Follow-up required</option>
            <option value="issue_found">Issue found</option>
          </select>
        </label>
      ) : null}

      {submission.outcome === "follow_up" || submission.outcome === "issue_found" ? (
        <label className="mt-4 block text-xs font-bold text-white/60">
          Notes
          <textarea
            value={submission.follow_up_notes}
            onChange={(event) => onChange({ ...submission, follow_up_notes: event.target.value })}
            placeholder="Describe the follow-up or issue"
            rows={3}
            className={inputClass()}
          />
        </label>
      ) : null}

      {requirements.location_confirmation ? (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.06] px-3 py-3 text-xs text-cyan-100/70">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          GPS must confirm you are within 250 meters of the stored service location when completing.
        </div>
      ) : null}

      {uploadError ? (
        <div className="mt-3 rounded-2xl border border-red-400/20 bg-red-400/[0.07] px-3 py-2 text-xs text-red-100">
          {uploadError}
        </div>
      ) : null}
    </div>
  );
}

function ProtocolField({ field, value, uploading, onChange, onFile }) {
  const label = `${field.label}${field.required ? " *" : ""}`;

  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/65">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4"
        />
        {label}
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label className="block text-xs font-bold text-white/60">
        {label}
        <select value={value || ""} onChange={(event) => onChange(event.target.value)} className={inputClass()}>
          <option value="">Select</option>
          {(field.options || []).map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "textarea") {
    return (
      <label className="block text-xs font-bold text-white/60">
        {label}
        <textarea value={value || ""} onChange={(event) => onChange(event.target.value)} rows={3} className={inputClass()} />
      </label>
    );
  }

  if (field.type === "photo" || field.type === "file") {
    return (
      <label className="block text-xs font-bold text-white/60">
        {label}
        <div className="mt-2 flex items-center gap-3 rounded-2xl border border-dashed border-white/15 bg-black/20 px-3 py-3">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin text-cyan-300" /> : field.type === "photo" ? <Camera className="h-4 w-4 text-cyan-300" /> : <FileUp className="h-4 w-4 text-cyan-300" />}
          <span className="min-w-0 flex-1 truncate text-xs text-white/45">
            {value?.file_name || "Choose file"}
          </span>
          <input
            type="file"
            accept={field.type === "photo" ? "image/*" : undefined}
            capture={field.type === "photo" ? "environment" : undefined}
            disabled={uploading}
            onChange={(event) => onFile(event.target.files?.[0] || null)}
            className="max-w-[120px] text-[10px] text-white/40"
          />
        </div>
      </label>
    );
  }

  const type = field.type === "number" || field.type === "measurement"
    ? "number"
    : field.type === "date"
      ? "date"
      : field.type === "datetime"
        ? "datetime-local"
        : "text";

  return (
    <label className="block text-xs font-bold text-white/60">
      {label}{field.unit ? ` (${field.unit})` : ""}
      <input
        type={type}
        value={value ?? ""}
        onChange={(event) => {
          const raw = event.target.value;
          onChange(type === "number" && raw !== "" ? Number(raw) : raw);
        }}
        className={inputClass()}
      />
      {field.help_text ? <div className="mt-1 text-[10px] text-white/30">{field.help_text}</div> : null}
    </label>
  );
}

function EvidenceUpload({ label, count, uploading, onFile }) {
  return (
    <label className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-3 text-xs text-white/55">
      <div className="flex items-center gap-2 font-bold">
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4 text-cyan-300" />}
        {label} {count ? `(${count})` : "*"}
      </div>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        disabled={uploading}
        onChange={(event) => onFile(event.target.files?.[0] || null)}
        className="mt-3 w-full text-[10px] text-white/35"
      />
    </label>
  );
}
