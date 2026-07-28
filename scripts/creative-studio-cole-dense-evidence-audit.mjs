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

function average(values = []) {
  const numbers = values
    .map((value) => finite(value, null))
    .filter((value) => value !== null);
  if (!numbers.length) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function stats(values = []) {
  const numbers = values
    .map((value) => finite(value, null))
    .filter((value) => value !== null);
  if (!numbers.length) return { count: 0, minimum: null, average: null, maximum: null };
  return {
    count: numbers.length,
    minimum: Math.min(...numbers),
    average: Number(average(numbers).toFixed(3)),
    maximum: Math.max(...numbers),
  };
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

function recomputedAccepted(frame, minimumQuality) {
  const analysis = frame?.analysis;
  return Boolean(
    upper(frame?.status || "COMPLETED") === "COMPLETED" &&
    analysis &&
    upper(analysis.status) === "VERIFIED" &&
    analysis.primary_performer_present === true &&
    analysis.lead_vocalist_present === true &&
    analysis.usable_for_showreel === true &&
    finite(analysis.technical_quality_score, -1) >= minimumQuality &&
    upper(analysis.occlusion_risk) !== "HIGH"
  );
}

function frameFailures(frame, minimumQuality) {
  const failures = [];
  const status = upper(frame?.status || "COMPLETED");
  const analysis = frame?.analysis;
  if (status !== "COMPLETED") failures.push(`STEP_${status || "UNKNOWN"}`);
  if (!analysis) {
    failures.push("MISSING_ANALYSIS");
    return failures;
  }
  if (upper(analysis.status) !== "VERIFIED") failures.push("STATUS_UNVERIFIED");
  if (analysis.primary_performer_present !== true) {
    failures.push("PRIMARY_PERFORMER_NOT_CONFIRMED");
  }
  if (analysis.lead_vocalist_present !== true) {
    failures.push("LEAD_VOCALIST_NOT_CONFIRMED");
  }
  if (analysis.usable_for_showreel !== true) failures.push("SHOWREEL_UNUSABLE");
  if (finite(analysis.technical_quality_score, -1) < minimumQuality) {
    failures.push("QUALITY_BELOW_THRESHOLD");
  }
  if (upper(analysis.occlusion_risk) === "HIGH") failures.push("HIGH_OCCLUSION");
  return failures;
}

function estimatedSegments(frames, duration, acceptance) {
  const ordered = [...frames].sort(
    (left, right) => finite(left.sample_index, 0) - finite(right.sample_index, 0),
  );
  if (!ordered.length || duration <= 0) return [];
  const points = ordered.map((frame) => finite(frame.relative_time_seconds, 0));
  const accepted = ordered.map((frame, index) => ({
    accepted: acceptance(frame),
    sample_index: finite(frame.sample_index, index),
    start_seconds: index === 0 ? 0 : (points[index - 1] + points[index]) / 2,
    end_seconds: index === ordered.length - 1
      ? duration
      : (points[index] + points[index + 1]) / 2,
  }));
  const groups = [];
  for (const segment of accepted) {
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
  return groups.map((group) => ({
    start_seconds: Number(group.start_seconds.toFixed(6)),
    end_seconds: Number(group.end_seconds.toFixed(6)),
    duration_seconds: Number((group.end_seconds - group.start_seconds).toFixed(6)),
    sample_count: group.sample_indexes.length,
    sample_indexes: group.sample_indexes,
  }));
}

const organizationId = text(
  process.env.CREATIVE_SMOKE_ORGANIZATION_ID ||
  process.env.COLE_LEY_ORGANIZATION_ID,
);
const projectId = text(process.env.COLE_LEY_PROJECT_ID);
const shortlistIdentity = text(process.env.COLE_LEY_PROJECT_SHORTLIST_IDENTITY);
const minimumQuality = finite(
  process.env.CREATIVE_DENSE_MINIMUM_QUALITY_SCORE,
  55,
);

if (!organizationId) throw new Error("CREATIVE_SMOKE_ORGANIZATION_ID required");
if (!projectId) throw new Error("COLE_LEY_PROJECT_ID required");

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");

const { data: nodes, error } = await supabaseAdmin
  .from("creative_asset_nodes")
  .select("*")
  .eq("organization_id", organizationId)
  .eq("creative_project_id", projectId)
  .neq("status", "ARCHIVED")
  .order("created_at", { ascending: true });
if (error) throw error;

const candidates = (nodes || []).filter((node) => {
  const metadata = node.metadata || {};
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

const failureCounts = new Map();
const reasonCounts = new Map();
const providerCounts = new Map();
const modelCounts = new Map();
const stepStatusCounts = new Map();
const analysisStatusCounts = new Map();
const allFrames = [];
const candidateReports = [];

for (const candidate of candidates) {
  const metadata = candidate.metadata || {};
  const sourceRange = metadata.original_source_range || {};
  const duration = finite(sourceRange.duration_seconds,
    Math.max(0, finite(sourceRange.end_seconds) - finite(sourceRange.start_seconds)));
  const frames = Array.isArray(metadata.ai_verification_frame_results)
    ? metadata.ai_verification_frame_results
    : [];
  const ordered = [...frames].sort(
    (left, right) => finite(left.sample_index, 0) - finite(right.sample_index, 0),
  );
  allFrames.push(...ordered);

  for (const frame of ordered) {
    increment(stepStatusCounts, upper(frame.status || "COMPLETED"));
    increment(analysisStatusCounts, upper(frame.analysis?.status || "MISSING"));
    increment(providerCounts, frame.provider || "MISSING");
    increment(modelCounts, frame.model || "MISSING");
    if (frame.reason) increment(reasonCounts, frame.reason);
    for (const reason of frame.analysis?.reasons || []) increment(reasonCounts, reason);
    for (const failure of frameFailures(frame, minimumQuality)) {
      increment(failureCounts, failure);
    }
  }

  const storedAccepted = ordered.filter((frame) => frame.accepted === true);
  const recomputedAcceptedFrames = ordered.filter((frame) =>
    recomputedAccepted(frame, minimumQuality)
  );
  const storedSegments = estimatedSegments(
    ordered,
    duration,
    (frame) => frame.accepted === true && upper(frame.status || "COMPLETED") === "COMPLETED",
  );
  const recomputedSegments = estimatedSegments(
    ordered,
    duration,
    (frame) => recomputedAccepted(frame, minimumQuality),
  );
  const qualifyingSegments = recomputedSegments.filter(
    (segment) => segment.duration_seconds >= 0.75,
  );

  candidateReports.push({
    candidate_id: candidate.id,
    shortlist_rank: finite(metadata.shortlist_rank, null),
    source_asset_node_id: metadata.source_asset_node_id || null,
    ai_verification_status: metadata.ai_verification_status || null,
    ai_verification_error: metadata.ai_verification_error || null,
    source_range: sourceRange,
    frame_count: ordered.length,
    stored_accepted_frame_count: storedAccepted.length,
    recomputed_accepted_frame_count: recomputedAcceptedFrames.length,
    stored_vs_recomputed_difference:
      recomputedAcceptedFrames.length - storedAccepted.length,
    provider_counts: entries(new Map(
      [...new Set(ordered.map((frame) => text(frame.provider) || "MISSING"))]
        .map((provider) => [
          provider,
          ordered.filter((frame) => (text(frame.provider) || "MISSING") === provider).length,
        ]),
    )),
    model_counts: entries(new Map(
      [...new Set(ordered.map((frame) => text(frame.model) || "MISSING"))]
        .map((model) => [
          model,
          ordered.filter((frame) => (text(frame.model) || "MISSING") === model).length,
        ]),
    )),
    quality_stats: stats(ordered.map((frame) => frame.analysis?.technical_quality_score)),
    face_visibility_stats: stats(ordered.map((frame) => frame.analysis?.face_visibility_score)),
    performance_energy_stats: stats(ordered.map((frame) => frame.analysis?.performance_energy_score)),
    stored_accepted_segments: storedSegments,
    recomputed_accepted_segments: recomputedSegments,
    qualifying_recomputed_segments: qualifyingSegments,
    qualifying_recomputed_duration_seconds: Number(
      qualifyingSegments.reduce((sum, segment) => sum + segment.duration_seconds, 0).toFixed(6),
    ),
    frame_evidence: ordered.map((frame) => ({
      sample_index: finite(frame.sample_index, null),
      sample_fraction: finite(frame.sample_fraction, null),
      relative_time_seconds: finite(frame.relative_time_seconds, null),
      source_time_seconds: finite(frame.source_time_seconds, null),
      step_status: upper(frame.status || "COMPLETED"),
      stored_accepted: frame.accepted === true,
      recomputed_accepted: recomputedAccepted(frame, minimumQuality),
      failures: frameFailures(frame, minimumQuality),
      reason: frame.reason || null,
      analysis: frame.analysis || null,
      provider: frame.provider || null,
      model: frame.model || null,
      usage_id: frame.usage_id || null,
    })),
  });
}

const storedAcceptedCount = allFrames.filter((frame) => frame.accepted === true).length;
const recomputedAcceptedCount = allFrames.filter((frame) =>
  recomputedAccepted(frame, minimumQuality)
).length;
const analysisPresentCount = allFrames.filter((frame) => frame.analysis).length;
const verifiedAnalysisCount = allFrames.filter((frame) =>
  upper(frame.analysis?.status) === "VERIFIED"
).length;
const qualifyingCandidateCount = candidateReports.filter((candidate) =>
  candidate.qualifying_recomputed_segments.length > 0
).length;
const qualifyingDurationSeconds = Number(candidateReports.reduce(
  (sum, candidate) => sum + candidate.qualifying_recomputed_duration_seconds,
  0,
).toFixed(6));

const findings = [];
if (allFrames.length !== 179) {
  findings.push(`FRAME_COUNT_MISMATCH:${allFrames.length}:EXPECTED_179`);
}
if (analysisPresentCount === 0) {
  findings.push("ALL_PROVIDER_OUTPUTS_FAILED_JSON_OR_OUTPUT_EXTRACTION");
} else if (verifiedAnalysisCount === 0) {
  findings.push("MODEL_MARKED_EVERY_FRAME_UNVERIFIED");
}
if (storedAcceptedCount === 0 && recomputedAcceptedCount > 0) {
  findings.push("STORED_ACCEPTANCE_INCONSISTENT_WITH_CURRENT_THRESHOLD");
}
if (recomputedAcceptedCount === 0 && analysisPresentCount > 0) {
  findings.push("STRICT_FRAME_GATES_REJECT_EVERY_ANALYSED_FRAME");
}
if (qualifyingCandidateCount > 0) {
  findings.push("SAVED_EVIDENCE_CONTAINS_RECOVERABLE_VERIFIED_RANGES");
}
if (qualifyingCandidateCount === 0 && recomputedAcceptedCount > 0) {
  findings.push("ACCEPTED_FRAMES_EXIST_BUT_NO_RANGE_MEETS_0_75_SECOND_RULE");
}

const report = {
  audit_version: "cole-dense-evidence-audit-v1",
  generated_at: new Date().toISOString(),
  provider_calls_executed_by_audit: 0,
  wallet_charges_created_by_audit: 0,
  production_started: false,
  organization_id: organizationId,
  creative_project_id: projectId,
  project_shortlist_identity: shortlistIdentity || null,
  minimum_quality_score: minimumQuality,
  summary: {
    candidate_count: candidates.length,
    frame_count: allFrames.length,
    analysis_present_count: analysisPresentCount,
    missing_analysis_count: allFrames.length - analysisPresentCount,
    verified_analysis_count: verifiedAnalysisCount,
    stored_accepted_frame_count: storedAcceptedCount,
    recomputed_accepted_frame_count: recomputedAcceptedCount,
    qualifying_candidate_count: qualifyingCandidateCount,
    qualifying_recomputed_duration_seconds: qualifyingDurationSeconds,
    technical_quality: stats(allFrames.map((frame) => frame.analysis?.technical_quality_score)),
    face_visibility: stats(allFrames.map((frame) => frame.analysis?.face_visibility_score)),
    performance_energy: stats(allFrames.map((frame) => frame.analysis?.performance_energy_score)),
  },
  findings,
  step_status_counts: entries(stepStatusCounts),
  analysis_status_counts: entries(analysisStatusCounts),
  failure_gate_counts: entries(failureCounts),
  reason_counts: entries(reasonCounts),
  provider_counts: entries(providerCounts),
  model_counts: entries(modelCounts),
  candidates: candidateReports,
};

const outputPath = path.join(
  os.tmpdir(),
  `COLE_DENSE_EVIDENCE_AUDIT_${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
);
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("COLE DENSE EVIDENCE AUDIT — ZERO PROVIDER CALLS");
console.log("============================================================");
console.log(`CANDIDATE_COUNT=${report.summary.candidate_count}`);
console.log(`FRAME_COUNT=${report.summary.frame_count}`);
console.log(`ANALYSIS_PRESENT_COUNT=${report.summary.analysis_present_count}`);
console.log(`MISSING_ANALYSIS_COUNT=${report.summary.missing_analysis_count}`);
console.log(`VERIFIED_ANALYSIS_COUNT=${report.summary.verified_analysis_count}`);
console.log(`STORED_ACCEPTED_FRAME_COUNT=${report.summary.stored_accepted_frame_count}`);
console.log(`RECOMPUTED_ACCEPTED_FRAME_COUNT=${report.summary.recomputed_accepted_frame_count}`);
console.log(`QUALIFYING_CANDIDATE_COUNT=${report.summary.qualifying_candidate_count}`);
console.log(`QUALIFYING_DURATION_SECONDS=${report.summary.qualifying_recomputed_duration_seconds}`);
console.log(`MINIMUM_QUALITY_SCORE=${minimumQuality}`);
console.log(`PROVIDER_CALLS_EXECUTED_BY_AUDIT=0`);
console.log(`WALLET_CHARGES_CREATED_BY_AUDIT=0`);
console.log(`PRODUCTION_STARTED=NO`);
console.log(`FINDINGS=${findings.join(",")}`);
console.log("------------------------------------------------------------");
console.log(`STEP_STATUS_COUNTS=${JSON.stringify(report.step_status_counts)}`);
console.log(`ANALYSIS_STATUS_COUNTS=${JSON.stringify(report.analysis_status_counts)}`);
console.log(`FAILURE_GATE_COUNTS=${JSON.stringify(report.failure_gate_counts)}`);
console.log(`REASON_COUNTS=${JSON.stringify(report.reason_counts)}`);
console.log(`PROVIDER_COUNTS=${JSON.stringify(report.provider_counts)}`);
console.log(`MODEL_COUNTS=${JSON.stringify(report.model_counts)}`);
console.log("------------------------------------------------------------");
for (const candidate of candidateReports) {
  console.log([
    `CANDIDATE=${candidate.candidate_id}`,
    `RANK=${candidate.shortlist_rank ?? ""}`,
    `FRAMES=${candidate.frame_count}`,
    `STORED_ACCEPTED=${candidate.stored_accepted_frame_count}`,
    `RECOMPUTED_ACCEPTED=${candidate.recomputed_accepted_frame_count}`,
    `QUALIFYING_RANGES=${candidate.qualifying_recomputed_segments.length}`,
    `QUALIFYING_SECONDS=${candidate.qualifying_recomputed_duration_seconds}`,
    `ERROR=${candidate.ai_verification_error || ""}`,
  ].join(" "));
}
console.log("============================================================");
console.log(`FULL_AUDIT_JSON=${outputPath}`);
console.log("============================================================");
