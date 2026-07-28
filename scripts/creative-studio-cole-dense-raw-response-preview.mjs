#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function upper(value) {
  return text(value).toUpperCase();
}

function bool(value) {
  if (value === true || value === false) return value;
  const normalized = text(value).toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return false;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function increment(map, key) {
  const normalized = text(key) || "(empty)";
  map.set(normalized, (map.get(normalized) || 0) + 1);
}

function entries(map) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([value, count]) => ({ value, count }));
}

function responseOutputText(raw = {}) {
  if (text(raw.output_text)) return text(raw.output_text);
  const parts = [];
  for (const item of Array.isArray(raw.output) ? raw.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (text(content?.text)) parts.push(text(content.text));
      if (text(content?.refusal)) parts.push(text(content.refusal));
    }
  }
  return parts.join("\n").trim();
}

function savedProviderText(usage = {}) {
  const metadata = object(usage.metadata);
  const result = object(metadata.result || metadata.provider_result);
  const output = object(result.output);
  return (
    text(output.text) ||
    text(result.text) ||
    responseOutputText(output.raw) ||
    responseOutputText(result.raw) ||
    responseOutputText(metadata.provider_response) ||
    ""
  );
}

function parseJson(value) {
  const source = text(value);
  if (!source) return null;
  const candidates = [source];
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) candidates.push(fenced);
  const firstBrace = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(source.slice(firstBrace, lastBrace + 1));
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // Try the next conservative extraction.
    }
  }
  return null;
}

function normalize(value = {}) {
  const source = object(value.result || value.analysis || value);
  const anchor = object(source.subject_anchor);
  return {
    status: upper(source.status) === "VERIFIED" ? "VERIFIED" : "UNVERIFIED",
    primary_performer_present: bool(source.primary_performer_present),
    lead_vocalist_present: bool(source.lead_vocalist_present),
    microphone_visible: bool(source.microphone_visible),
    face_visibility_score: finite(source.face_visibility_score, 0),
    technical_quality_score: finite(source.technical_quality_score, 0),
    performance_energy_score: finite(source.performance_energy_score, 0),
    usable_for_showreel: bool(source.usable_for_showreel),
    framing: upper(source.framing) || "UNUSABLE",
    subject_anchor: {
      x: finite(anchor.x, 0.5),
      y: finite(anchor.y, 0.5),
    },
    crop_safety: source.crop_safety || null,
    occlusion_risk: upper(source.occlusion_risk) || "UNKNOWN",
    reasons: Array.isArray(source.reasons)
      ? source.reasons.map(text).filter(Boolean)
      : [],
  };
}

function accepted(analysis, minimumQuality) {
  return Boolean(
    analysis &&
    analysis.status === "VERIFIED" &&
    analysis.primary_performer_present === true &&
    analysis.lead_vocalist_present === true &&
    analysis.usable_for_showreel === true &&
    analysis.technical_quality_score >= minimumQuality &&
    analysis.occlusion_risk !== "HIGH"
  );
}

function acceptedRanges(frames, duration) {
  const ordered = [...frames].sort(
    (left, right) => finite(left.sample_index, 0) - finite(right.sample_index, 0),
  );
  if (!ordered.length || duration <= 0) return [];
  const points = ordered.map((frame) => finite(frame.relative_time_seconds, 0));
  const segments = ordered.map((frame, index) => ({
    accepted: frame.recovered_accepted === true && upper(frame.status) === "COMPLETED",
    start_seconds: index === 0
      ? 0
      : (points[index - 1] + points[index]) / 2,
    end_seconds: index === ordered.length - 1
      ? duration
      : (points[index] + points[index + 1]) / 2,
    sample_index: finite(frame.sample_index, index),
  }));
  const groups = [];
  for (const segment of segments) {
    if (!segment.accepted) continue;
    const previous = groups.at(-1);
    if (previous && Math.abs(previous.end_seconds - segment.start_seconds) <= 0.001) {
      previous.end_seconds = segment.end_seconds;
      previous.sample_indexes.push(segment.sample_index);
    } else {
      groups.push({
        start_seconds: segment.start_seconds,
        end_seconds: segment.end_seconds,
        sample_indexes: [segment.sample_index],
      });
    }
  }
  return groups
    .map((group) => ({
      start_seconds: Number(group.start_seconds.toFixed(6)),
      end_seconds: Number(group.end_seconds.toFixed(6)),
      duration_seconds: Number((group.end_seconds - group.start_seconds).toFixed(6)),
      sample_count: group.sample_indexes.length,
      sample_indexes: group.sample_indexes,
    }))
    .filter((group) => group.duration_seconds >= 0.75);
}

async function rowsByIds(supabaseAdmin, table, ids) {
  const rows = [];
  for (let offset = 0; offset < ids.length; offset += 50) {
    const batch = ids.slice(offset, offset + 50);
    const { data, error } = await supabaseAdmin
      .from(table)
      .select("*")
      .in("id", batch);
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
}

const organizationId = text(
  process.env.CREATIVE_SMOKE_ORGANIZATION_ID ||
  process.env.COLE_LEY_ORGANIZATION_ID,
);
const projectId = text(process.env.COLE_LEY_PROJECT_ID);
const shortlistIdentity = text(process.env.COLE_LEY_PROJECT_SHORTLIST_IDENTITY);
const minimumQuality = finite(process.env.CREATIVE_DENSE_MINIMUM_QUALITY_SCORE, 55);

if (!organizationId) throw new Error("CREATIVE_SMOKE_ORGANIZATION_ID required");
if (!projectId) throw new Error("COLE_LEY_PROJECT_ID required");

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const { data: nodes, error: nodeError } = await supabaseAdmin
  .from("creative_asset_nodes")
  .select("*")
  .eq("organization_id", organizationId)
  .eq("creative_project_id", projectId)
  .neq("status", "ARCHIVED")
  .order("created_at", { ascending: true });
if (nodeError) throw nodeError;

const candidates = (nodes || []).filter((node) => {
  const metadata = object(node.metadata);
  return (
    node.type === "MOMENT" &&
    metadata.local_shortlist_candidate === true &&
    metadata.selected_for_ai_verification === true &&
    (!shortlistIdentity || metadata.project_shortlist_identity === shortlistIdentity)
  );
}).sort((left, right) =>
  finite(left.metadata?.shortlist_rank, 9999) -
  finite(right.metadata?.shortlist_rank, 9999)
);
if (!candidates.length) throw new Error("COLE_DENSE_SHORTLIST_CANDIDATES_NOT_FOUND");

const usageIds = [...new Set(candidates.flatMap((candidate) =>
  (Array.isArray(candidate.metadata?.ai_verification_frame_results)
    ? candidate.metadata.ai_verification_frame_results
    : [])
    .map((frame) => text(frame.usage_id))
    .filter(Boolean)
))];
const usageRows = await rowsByIds(
  supabaseAdmin,
  "platform_service_usage",
  usageIds,
);
const usageById = new Map(usageRows.map((row) => [String(row.id), row]));

const parseFailureTypes = new Map();
const rawSchemaCounts = new Map();
const statusCounts = new Map();
const reasonCounts = new Map();
const candidateReports = [];
let frameCount = 0;
let usageLinkedCount = 0;
let savedTextCount = 0;
let parsedCount = 0;
let recoveredAcceptedCount = 0;
let storedAcceptedCount = 0;
let qualifyingSeconds = 0;

for (const candidate of candidates) {
  const metadata = object(candidate.metadata);
  const sourceRange = object(metadata.original_source_range);
  const duration = finite(
    sourceRange.duration_seconds,
    Math.max(0, finite(sourceRange.end_seconds) - finite(sourceRange.start_seconds)),
  );
  const frames = Array.isArray(metadata.ai_verification_frame_results)
    ? metadata.ai_verification_frame_results
    : [];
  const recoveredFrames = [];

  for (const frame of frames) {
    frameCount += 1;
    if (frame.accepted === true) storedAcceptedCount += 1;
    const usage = usageById.get(String(frame.usage_id || ""));
    if (usage) usageLinkedCount += 1;
    const providerResult = object(usage?.metadata?.result);
    const providerOutput = object(providerResult.output);
    increment(
      rawSchemaCounts,
      [
        providerResult.success === true ? "SUCCESS" : "NO_SUCCESS_FLAG",
        providerOutput.text !== undefined ? "OUTPUT_TEXT" : "NO_OUTPUT_TEXT",
        providerOutput.raw !== undefined ? "OUTPUT_RAW" : "NO_OUTPUT_RAW",
      ].join("|"),
    );
    const savedText = savedProviderText(usage);
    if (savedText) savedTextCount += 1;
    const parsed = parseJson(savedText);
    if (parsed) parsedCount += 1;
    const analysis = parsed ? normalize(parsed) : null;
    const recoveredAccepted = accepted(analysis, minimumQuality);
    if (recoveredAccepted) recoveredAcceptedCount += 1;
    if (analysis) {
      increment(statusCounts, analysis.status);
      for (const reason of analysis.reasons) increment(reasonCounts, reason);
    } else {
      const failure = !usage
        ? "USAGE_ROW_NOT_FOUND"
        : !savedText
          ? "SAVED_PROVIDER_TEXT_EMPTY"
          : "SAVED_PROVIDER_TEXT_INVALID_JSON";
      increment(parseFailureTypes, failure);
    }
    recoveredFrames.push({
      ...frame,
      recovered_analysis: analysis,
      recovered_accepted: recoveredAccepted,
      saved_provider_text_present: Boolean(savedText),
      saved_provider_text_preview: savedText.slice(0, 240),
      saved_provider_text_length: savedText.length,
      usage_status: usage?.status || null,
      usage_customer_price: finite(usage?.customer_price, null),
    });
  }

  const ranges = acceptedRanges(recoveredFrames, duration);
  const candidateSeconds = Number(
    ranges.reduce((sum, range) => sum + range.duration_seconds, 0).toFixed(6),
  );
  qualifyingSeconds += candidateSeconds;
  candidateReports.push({
    candidate_id: candidate.id,
    shortlist_rank: finite(metadata.shortlist_rank, null),
    frame_count: frames.length,
    recovered_parsed_frame_count:
      recoveredFrames.filter((frame) => frame.recovered_analysis).length,
    recovered_accepted_frame_count:
      recoveredFrames.filter((frame) => frame.recovered_accepted).length,
    qualifying_range_count: ranges.length,
    qualifying_duration_seconds: candidateSeconds,
    qualifying_ranges: ranges,
    frames: recoveredFrames,
  });
}

qualifyingSeconds = Number(qualifyingSeconds.toFixed(6));
const qualifyingCandidateCount = candidateReports.filter(
  (candidate) => candidate.qualifying_range_count > 0,
).length;
const findings = [];
if (savedTextCount > 0 && parsedCount > 0) {
  findings.push("RAW_PROVIDER_TEXT_RECOVERABLE");
}
if (parsedCount === 178 && recoveredAcceptedCount > 0) {
  findings.push("WRAPPER_NORMALIZATION_BUG_CONFIRMED");
}
if (recoveredAcceptedCount > 0) {
  findings.push("SAVED_EVIDENCE_CONTAINS_ACCEPTED_FRAMES");
}
if (qualifyingCandidateCount > 0) {
  findings.push("SAVED_EVIDENCE_CONTAINS_QUALIFYING_RANGES");
}
if (savedTextCount === 0) {
  findings.push("SAVED_PROVIDER_TEXT_NOT_FOUND");
}
if (parsedCount > 0 && recoveredAcceptedCount === 0) {
  findings.push("MODEL_OUTPUTS_PARSED_BUT_STILL_REJECT_ALL_FRAMES");
}

const report = {
  preview_version: "cole-dense-raw-response-preview-v1",
  generated_at: new Date().toISOString(),
  provider_calls_executed: 0,
  wallet_charges_created: 0,
  database_writes: 0,
  production_started: false,
  organization_id: organizationId,
  creative_project_id: projectId,
  project_shortlist_identity: shortlistIdentity || null,
  minimum_quality_score: minimumQuality,
  summary: {
    candidate_count: candidates.length,
    frame_count: frameCount,
    distinct_usage_id_count: usageIds.length,
    usage_row_count: usageRows.length,
    usage_linked_frame_count: usageLinkedCount,
    saved_provider_text_count: savedTextCount,
    parsed_saved_response_count: parsedCount,
    stored_accepted_frame_count: storedAcceptedCount,
    recovered_accepted_frame_count: recoveredAcceptedCount,
    qualifying_candidate_count: qualifyingCandidateCount,
    qualifying_duration_seconds: qualifyingSeconds,
  },
  findings,
  raw_schema_counts: entries(rawSchemaCounts),
  recovered_status_counts: entries(statusCounts),
  parse_failure_types: entries(parseFailureTypes),
  recovered_reason_counts: entries(reasonCounts),
  candidates: candidateReports,
};

const outputPath = path.join(
  os.tmpdir(),
  `COLE_DENSE_RAW_RESPONSE_PREVIEW_${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
);
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("COLE DENSE RAW RESPONSE RECOVERY PREVIEW — ZERO COST");
console.log("============================================================");
console.log(`CANDIDATE_COUNT=${report.summary.candidate_count}`);
console.log(`FRAME_COUNT=${report.summary.frame_count}`);
console.log(`DISTINCT_USAGE_ID_COUNT=${report.summary.distinct_usage_id_count}`);
console.log(`USAGE_ROW_COUNT=${report.summary.usage_row_count}`);
console.log(`USAGE_LINKED_FRAME_COUNT=${report.summary.usage_linked_frame_count}`);
console.log(`SAVED_PROVIDER_TEXT_COUNT=${report.summary.saved_provider_text_count}`);
console.log(`PARSED_SAVED_RESPONSE_COUNT=${report.summary.parsed_saved_response_count}`);
console.log(`STORED_ACCEPTED_FRAME_COUNT=${report.summary.stored_accepted_frame_count}`);
console.log(`RECOVERED_ACCEPTED_FRAME_COUNT=${report.summary.recovered_accepted_frame_count}`);
console.log(`QUALIFYING_CANDIDATE_COUNT=${report.summary.qualifying_candidate_count}`);
console.log(`QUALIFYING_DURATION_SECONDS=${report.summary.qualifying_duration_seconds}`);
console.log(`MINIMUM_QUALITY_SCORE=${minimumQuality}`);
console.log(`FINDINGS=${findings.join(",")}`);
console.log(`RAW_SCHEMA_COUNTS=${JSON.stringify(report.raw_schema_counts)}`);
console.log(`RECOVERED_STATUS_COUNTS=${JSON.stringify(report.recovered_status_counts)}`);
console.log(`PARSE_FAILURE_TYPES=${JSON.stringify(report.parse_failure_types)}`);
console.log(`RECOVERED_REASON_COUNTS=${JSON.stringify(report.recovered_reason_counts)}`);
console.log("------------------------------------------------------------");
for (const candidate of candidateReports) {
  console.log([
    `CANDIDATE=${candidate.candidate_id}`,
    `RANK=${candidate.shortlist_rank ?? ""}`,
    `FRAMES=${candidate.frame_count}`,
    `PARSED=${candidate.recovered_parsed_frame_count}`,
    `ACCEPTED=${candidate.recovered_accepted_frame_count}`,
    `QUALIFYING_RANGES=${candidate.qualifying_range_count}`,
    `QUALIFYING_SECONDS=${candidate.qualifying_duration_seconds}`,
  ].join(" "));
}
console.log("============================================================");
console.log("PROVIDER_CALLS_EXECUTED=0");
console.log("WALLET_CHARGES_CREATED=0");
console.log("DATABASE_WRITES=0");
console.log("PRODUCTION_STARTED=NO");
console.log(`FULL_PREVIEW_JSON=${outputPath}`);
console.log("============================================================");
