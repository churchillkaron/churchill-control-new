"use client";

import Image from "next/image";
import { ArrowUpRight, BadgeCheck, Download, FileSpreadsheet, FileText, Folder, ImageIcon, Music2, Video } from "lucide-react";

const URL_KEYS = new Set([
  "url", "href", "file_url", "signed_url", "inspection_url", "asset_url",
  "generated_media_url", "output_url", "preview_url", "image_url", "video_url",
  "audio_url", "package_url", "screenshot_url", "thumbnail_url", "document_url",
  "pdf_url", "receipt_url", "download_url", "master_url", "media_url", "storage_reference",
  "playback_url", "primary_url", "master_signed_url", "uri", "output_reference",
  "final_url", "render_url", "final_render_url", "build_artifact_url", "output_storage_reference",
  "provider_receipt_url", "waveform_url",
]);

function text(value) {
  return String(value ?? "").trim();
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function periodDateParts(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(value));
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year: match[1], month, day: match[3] };
}
function periodDisplayLabel(startDate, endDate, fallbackId) {
  const start = periodDateParts(startDate);
  const end = periodDateParts(endDate);
  if (!start) return text(fallbackId) || "—";
  if (!end || (start.year === end.year && start.month === end.month)) return `${MONTHS[start.month - 1]} ${start.year}`;
  if (start.year === end.year) return `${MONTHS[start.month - 1]}–${MONTHS[end.month - 1]} ${start.year}`;
  return `${MONTHS[start.month - 1]} ${start.year}–${MONTHS[end.month - 1]} ${end.year}`;
}

function safeArtifactUrl(value, organizationId) {
  const url = text(value);
  if (!url) return null;
  if (url.startsWith("storage://")) {
    const query = new URLSearchParams({
      organizationId: text(organizationId),
      reference: url,
    });
    return `/api/operator/media?${query.toString()}`;
  }
  if (url.startsWith("/")) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return null;
}

function mediaKind(value, mimeType = "", key = "") {
  const mime = text(mimeType).toLowerCase();
  const source = text(value).toLowerCase().split("?")[0];
  const field = text(key).toLowerCase();
  if (mime.startsWith("image/") || /image|screenshot|thumbnail/.test(field) || /\.(png|jpe?g|webp|gif|avif)$/.test(source)) return "image";
  if (mime.startsWith("video/") || /video|master/.test(field) || /\.(mp4|webm|mov|m4v)$/.test(source)) return "video";
  if (mime.startsWith("audio/") || /audio/.test(field) || /\.(mp3|wav|m4a|aac|ogg|flac)$/.test(source)) return "audio";
  if (mime === "application/pdf" || /pdf|receipt|document/.test(field) || /\.pdf$/.test(source)) return "document";
  if (/spreadsheet|excel|csv/.test(mime) || /\.(xlsx?|csv)$/.test(source)) return "spreadsheet";
  return "file";
}

function itemLabel(value, parent, kind, index) {
  return text(
    value?.label || value?.title || value?.name || value?.file_name || value?.original_file_name ||
    parent?.label || parent?.title || parent?.name,
  ) || `${kind === "document" ? "Document" : kind === "file" ? "File" : kind[0].toUpperCase() + kind.slice(1)} ${index + 1}`;
}

function folderLabel(value, parent, kind) {
  return text(
    value?.folder || value?.folder_name || value?.filing_folder || value?.group || value?.section ||
    parent?.folder || parent?.folder_name || parent?.filing_folder || parent?.group || parent?.section,
  ) || (kind === "image" ? "Images" : kind === "video" ? "Videos" : kind === "audio" ? "Audio" : kind === "document" ? "Documents" : kind === "spreadsheet" ? "Spreadsheets" : "Files");
}

export function operatorExecutionArtifacts({ execution = {}, evidence = {}, organizationId = null } = {}) {
  const roots = [execution, execution?.result, evidence];
  const items = [];
  const seen = new Set();

  function add(raw, owner = {}, parent = {}, key = "url") {
    const url = safeArtifactUrl(raw, organizationId);
    if (!url || seen.has(url)) return;
    const mimeType = text(owner?.mime_type || owner?.mimeType || owner?.content_type || owner?.mime);
    const kind = mediaKind(raw, mimeType, key);
    seen.add(url);
    items.push({
      url,
      kind,
      mime_type: mimeType || null,
      label: itemLabel(owner, parent, kind, items.length),
      folder: folderLabel(owner, parent, kind),
      preview_rows: Array.isArray(owner?.rows) ? owner.rows.slice(0, 20) : Array.isArray(owner?.data) ? owner.data.slice(0, 20) : null,
    });
  }

  function visit(value, depth = 0, parent = null) {
    if (!value || depth > 8 || items.length >= 48) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, depth + 1, parent));
      return;
    }
    if (typeof value !== "object") return;

    for (const [key, raw] of Object.entries(value)) {
      const normalizedKey = text(key).toLowerCase();
      if (typeof raw === "string" && URL_KEYS.has(normalizedKey)) add(raw, value, parent || {}, normalizedKey);
      if (raw && typeof raw === "object") visit(raw, depth + 1, value);
    }
  }

  roots.forEach((root) => visit(root));
  return items;
}

function KindIcon({ kind }) {
  if (kind === "image") return <ImageIcon size={13} />;
  if (kind === "video") return <Video size={13} />;
  if (kind === "audio") return <Music2 size={13} />;
  if (kind === "spreadsheet") return <FileSpreadsheet size={13} />;
  return <FileText size={13} />;
}

function SpreadsheetPreview({ rows = [] }) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const objectRows = rows.every((row) => row && typeof row === "object" && !Array.isArray(row));
  const columns = objectRows
    ? [...new Set(rows.flatMap((row) => Object.keys(row)))].slice(0, 12)
    : [];

  return (
    <div className="max-h-[360px] overflow-auto border-b border-white/[0.06] bg-black/15">
      <table className="min-w-full border-collapse text-left text-[9px] text-white/65">
        {objectRows && columns.length ? (
          <>
            <thead className="sticky top-0 bg-[#151411] text-[#E5C28D]">
              <tr>{columns.map((column) => <th key={column} className="border-b border-white/10 px-2 py-2 font-medium">{column}</th>)}</tr>
            </thead>
            <tbody>{rows.map((row, index) => (
              <tr key={index} className="border-b border-white/[0.05]">
                {columns.map((column) => <td key={column} className="max-w-[240px] truncate px-2 py-2">{text(row?.[column])}</td>)}
              </tr>
            ))}</tbody>
          </>
        ) : (
          <tbody>{rows.map((row, index) => (
            <tr key={index} className="border-b border-white/[0.05]">
              {(Array.isArray(row) ? row : [row]).slice(0, 12).map((cell, cellIndex) => <td key={cellIndex} className="max-w-[240px] truncate px-2 py-2">{text(cell)}</td>)}
            </tr>
          ))}</tbody>
        )}
      </table>
    </div>
  );
}

function ArtifactPreview({ artifact }) {
  if (artifact.kind === "image") {
    return <Image src={artifact.url} alt={artifact.label} width={1400} height={900} unoptimized className="h-auto max-h-[520px] w-full bg-black/20 object-contain" />;
  }
  if (artifact.kind === "video") {
    return <video src={artifact.url} controls preload="metadata" playsInline className="max-h-[560px] w-full bg-black" />;
  }
  if (artifact.kind === "audio") {
    return <audio src={artifact.url} controls preload="metadata" className="w-full" />;
  }
  if (artifact.kind === "document") {
    return <iframe src={artifact.url} title={artifact.label} loading="lazy" className="h-[420px] w-full bg-white" />;
  }
  if (artifact.kind === "spreadsheet") {
    return <SpreadsheetPreview rows={artifact.preview_rows || []} />;
  }
  return null;
}


const DIAGNOSIS_STATE_LABELS = Object.freeze({
  TARGET_METRIC_EVIDENCE_GAP: "Not enough verified data yet",
  INTERNAL_COVERAGE_INCOMPLETE_WITH_SUPPORTED_EXTERNAL: "Partly explained with external support",
  INTERNAL_COVERAGE_INCOMPLETE: "Partly explained from internal data",
  INTERNAL_AND_SUPPORTED_EXTERNAL: "Explained with internal and external evidence",
  INTERNAL_WITH_UNRESOLVED_EXTERNAL_RESIDUAL: "Internal drivers found; some change remains unexplained",
  INTERNAL_SUFFICIENT: "Explained from internal business data",
  VERIFIED_EVIDENCE: "Verified business evidence",
});
const DIAGNOSIS_CLASS_LABELS = Object.freeze({
  CAUSAL_DIAGNOSIS: "Why performance changed",
  PERIOD_COMPARISON: "Period comparison",
  EVIDENCE_FIRST_RECOMMENDATION: "Recommendation based on verified evidence",
  CHANGE_DIAGNOSIS: "Business performance change",
  DIRECT_GOVERNED_DIAGNOSIS: "Governed business analysis",
});
const ANSWER_BOUNDARY_LABELS = Object.freeze({
  PASS: "Answer matched the verified evidence",
  APPENDED_REQUIRED_UNCERTAINTY: "Uncertainty was added where evidence is incomplete",
  REPLACED_OVERCLAIM: "An unsupported causal claim was removed",
  REPLACED_UNSUPPORTED_RECOMMENDATION_OUTCOME: "An unsupported outcome promise was removed",
});
function diagnosisPresentationLabel(map, value, fallback) {
  const key = text(value);
  return map[key] || fallback || key.replaceAll("_", " ");
}


function persistedProofLabel({ auditVerified = false, auditStatus = "" } = {}) {
  if (auditVerified && auditStatus === "VERIFIED") return "Verified live or after reload";
  if (auditVerified && auditStatus === "VERIFIED_LEGACY") return "Verified legacy proof";
  if (auditStatus === "MISMATCH") return "Integrity mismatch";
  if (auditStatus === "UNSUPPORTED_VERSION") return "Unsupported proof version";
  if (auditStatus === "NOT_AVAILABLE") return "Legacy proof · checksum unavailable";
  return "Live proof";
}


function diagnosisProofHeading({ auditVerified = false, auditStatus = "" } = {}) {
  if (auditVerified && (auditStatus === "VERIFIED" || auditStatus === "VERIFIED_LEGACY")) return "Verified diagnosis";
  return "Diagnosis proof";
}

function DiagnosisProof({ evidence = {} }) {
  const diagnosis = evidence?.business_diagnosis;
  if (!diagnosis?.receipt_fingerprint) return null;
  const fingerprint = text(diagnosis.receipt_fingerprint);
  const state = text(diagnosis.final_evidence_state) || "VERIFIED_EVIDENCE";
  const boundary = text(diagnosis.answer_boundary_status) || "PASS";
  const diagnosisClass = text(diagnosis.class);
  const businessTimezone = text(diagnosis.business_timezone);
  const periods = diagnosis.periods || {};
  const auditVerified = diagnosis.audit_projection_verified === true;
  const auditStatus = text(diagnosis.audit_projection_verification_status);
  const baselinePeriodLabel = periodDisplayLabel(periods.baseline_start_date, periods.baseline_end_date, periods.baseline_period_id);
  const currentPeriodLabel = periodDisplayLabel(periods.current_start_date, periods.current_end_date, periods.current_period_id);
  const stateLabel = diagnosisPresentationLabel(DIAGNOSIS_STATE_LABELS, state, "Verified business evidence");
  const classLabel = diagnosisPresentationLabel(DIAGNOSIS_CLASS_LABELS, diagnosisClass, "Governed business diagnosis");
  const boundaryLabel = diagnosisPresentationLabel(ANSWER_BOUNDARY_LABELS, boundary, "Answer checked against evidence");
  const validatedExternalCount = Number.isFinite(Number(diagnosis.validated_external_context_count)) ? Number(diagnosis.validated_external_context_count) : 0;
  const unresolvedExternalCount = Number.isFinite(Number(diagnosis.unresolved_external_context_count)) ? Number(diagnosis.unresolved_external_context_count) : 0;
  const persistedProofStatus = persistedProofLabel({ auditVerified, auditStatus });
  const proofHeading = diagnosisProofHeading({ auditVerified, auditStatus });
  return (
    <details data-avantiqo-business-diagnosis-proof="true" className="mt-3 overflow-hidden rounded-xl border border-[#D6A66A]/20 bg-black/20">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-[10px] text-white/70">
        <span className="flex items-center gap-2 font-medium text-[#E5C28D]"><BadgeCheck size={13} />{proofHeading}</span>
        <span className="text-[9px] text-white/35">{stateLabel}</span>
      </summary>
      <div className="grid gap-2 border-t border-white/[0.06] px-3 py-3 text-[9px] text-white/50 sm:grid-cols-2">
        <div><span className="text-white/30">Evidence state</span><div className="mt-0.5 text-white/65">{stateLabel}</div><div className="mt-0.5 font-mono text-[8px] text-white/30">{state}</div></div>
        <div><span className="text-white/30">Request type</span><div className="mt-0.5 text-white/65">{classLabel}</div><div className="mt-0.5 font-mono text-[8px] text-white/30">{diagnosisClass || "—"}</div></div>
        <div><span className="text-white/30">Answer boundary</span><div className="mt-0.5 text-white/65">{boundaryLabel}</div><div className="mt-0.5 font-mono text-[8px] text-white/30">{boundary}</div></div>
        <div><span className="text-white/30">Compared periods</span><div className="mt-0.5 text-white/65">{baselinePeriodLabel} → {currentPeriodLabel}</div></div>
        <div><span className="text-white/30">Business timezone</span><div className="mt-0.5 text-white/65">{businessTimezone || "UTC"}</div></div>
        <div><span className="text-white/30">Unexplained residual</span><div className="mt-0.5 text-white/65">{diagnosis.residual_material === true ? "Some of the change remains unexplained" : "No material unexplained change flagged"}</div></div>
        <div><span className="text-white/30">External evidence</span><div className="mt-0.5 text-white/65">{validatedExternalCount ? `${validatedExternalCount} validated` : "No validated external evidence"}{unresolvedExternalCount ? ` · ${unresolvedExternalCount} unresolved` : ""}</div></div>
        <div className="sm:col-span-2"><span className="text-white/30">Period IDs</span><div className="mt-0.5 break-all font-mono text-[8px] text-white/40">{text(periods.baseline_period_id) || "—"} → {text(periods.current_period_id) || "—"}</div></div>
        <div><span className="text-white/30">Persisted proof</span><div className="mt-0.5 text-white/65">{persistedProofStatus}</div></div>
        <div className="sm:col-span-2"><span className="text-white/30">Proof receipt</span><div className="mt-0.5 break-all font-mono text-[8px] text-white/45">{fingerprint}</div></div>
        <div className="sm:col-span-2 text-[8px] text-white/30">Analysis only · no action was executed · raw reasoning is not stored.</div>
      </div>
    </details>
  );
}

export default function OperatorExecutionArtifacts({ execution = {}, evidence = {}, organizationId = null }) {
  const artifacts = operatorExecutionArtifacts({ execution, evidence, organizationId });
  const diagnosisProof = <DiagnosisProof evidence={evidence} />;
  if (!artifacts.length) return diagnosisProof;

  const folders = artifacts.reduce((map, artifact) => {
    if (!map.has(artifact.folder)) map.set(artifact.folder, []);
    map.get(artifact.folder).push(artifact);
    return map;
  }, new Map());

  return (
    <>
      {diagnosisProof}
      <div data-avantiqo-execution-artifacts="true" data-avantiqo-universal-preview="true" className="mt-3 space-y-2">
      {[...folders.entries()].map(([folder, folderItems]) => (
        <details key={folder} open className="overflow-hidden rounded-xl border border-[#D6A66A]/20 bg-black/20">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-[10px] font-medium text-[#E5C28D]">
            <span className="flex items-center gap-2"><Folder size={13} />{folder}</span>
            <span className="text-[9px] text-white/35">{folderItems.length}</span>
          </summary>
          <div className="space-y-2 border-t border-white/[0.06] p-2">
            {folderItems.map((artifact, index) => (
              <div key={`${artifact.url}-${index}`} className="overflow-hidden rounded-lg border border-white/[0.07] bg-black/25">
                <ArtifactPreview artifact={artifact} />
                <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-2 text-[10px] text-white/65">
                    <KindIcon kind={artifact.kind} />
                    <span className="truncate">{artifact.label}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <a href={artifact.url} target="_blank" rel="noreferrer noopener" className="rounded-md border border-white/10 p-1.5 text-white/45 hover:text-[#D6A66A]" aria-label={`Open ${artifact.label}`}><ArrowUpRight size={11} /></a>
                    <a href={artifact.url} download className="rounded-md border border-white/10 p-1.5 text-white/45 hover:text-[#D6A66A]" aria-label={`Download ${artifact.label}`}><Download size={11} /></a>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </details>
      ))}
      </div>
    </>
  );
}
