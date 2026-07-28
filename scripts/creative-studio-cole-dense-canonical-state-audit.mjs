#!/usr/bin/env node

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const REPAIR_VERSION = "cole-dense-canonical-evidence-repair-v1";
const EXPECTED_CANDIDATES = 14;
const EXPECTED_FRAMES = 179;
const EXPECTED_PARSED = 178;
const EXPECTED_MISSING = 1;
const EXPECTED_ZERO_TO_TEN = 164;
const EXPECTED_ZERO_TO_HUNDRED = 14;
const EXPECTED_PERFORMANCE_RANGES = 24;
const EXPECTED_HERO_RANGES = 29;
const EXPECTED_PERFORMANCE_SECONDS = 196.704;
const EXPECTED_HERO_SECONDS = 111.133;
const DURATION_TOLERANCE = 0.01;

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

function closeTo(left, right, tolerance = DURATION_TOLERANCE) {
  return Math.abs(finite(left) - finite(right)) <= tolerance;
}

function sum(values) {
  return Number(values.reduce((total, value) => total + finite(value), 0).toFixed(6));
}

const organizationId = text(
  process.env.CREATIVE_SMOKE_ORGANIZATION_ID ||
  process.env.COLE_LEY_ORGANIZATION_ID,
);
const projectId = text(process.env.COLE_LEY_PROJECT_ID);
const shortlistIdentity = text(process.env.COLE_LEY_PROJECT_SHORTLIST_IDENTITY);
const planIdentity = text(process.env.COLE_LEY_DENSE_PLAN_IDENTITY);

if (!organizationId) throw new Error("CREATIVE_SMOKE_ORGANIZATION_ID required");
if (!projectId) throw new Error("COLE_LEY_PROJECT_ID required");
if (!shortlistIdentity) throw new Error("COLE_LEY_PROJECT_SHORTLIST_IDENTITY required");
if (!planIdentity) throw new Error("COLE_LEY_DENSE_PLAN_IDENTITY required");

const {
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} = await import("@/lib/creative/assets/graph/documents/CreativeAssetNode");
const AssetGraphRepository = await import(
  "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository"
);

const nodes = await AssetGraphRepository.listByProject({
  organization_id: organizationId,
  creative_project_id: projectId,
});

const reports = nodes
  .filter((node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT &&
    node.metadata?.project_shortlist_report === true &&
    node.metadata?.project_shortlist_identity === shortlistIdentity &&
    node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED
  )
  .sort((left, right) =>
    Date.parse(right.updated_at || right.created_at || 0) -
    Date.parse(left.updated_at || left.created_at || 0)
  );
const report = reports[0] || null;
if (!report) throw new Error("COLE_DENSE_SHORTLIST_REPORT_NOT_FOUND");

const candidates = nodes
  .filter((node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.MOMENT &&
    node.metadata?.local_shortlist_candidate === true &&
    node.metadata?.selected_for_ai_verification === true &&
    node.metadata?.project_shortlist_identity === shortlistIdentity &&
    node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED
  )
  .sort((left, right) =>
    finite(left.metadata?.shortlist_rank, 9999) -
    finite(right.metadata?.shortlist_rank, 9999)
  );

const derivedMoments = nodes
  .filter((node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.MOMENT &&
    node.metadata?.canonical_evidence_repair_version === REPAIR_VERSION &&
    node.metadata?.canonical_evidence_identity &&
    node.metadata?.canonical_evidence_repair === true &&
    node.metadata?.performance_verified === true &&
    node.metadata?.local_shortlist_candidate !== true &&
    node.metadata?.project_shortlist_identity === shortlistIdentity &&
    node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED
  );

const candidateMomentIds = candidates.flatMap((candidate) =>
  Array.isArray(candidate.metadata?.verified_moment_ids)
    ? candidate.metadata.verified_moment_ids.map(String)
    : []
);
const uniqueCandidateMomentIds = [...new Set(candidateMomentIds)];
const derivedMomentIds = new Set(derivedMoments.map((node) => String(node.id)));
const missingLinkedMomentIds = uniqueCandidateMomentIds.filter(
  (id) => !derivedMomentIds.has(id),
);
const orphanDerivedMomentIds = derivedMoments
  .map((node) => String(node.id))
  .filter((id) => !uniqueCandidateMomentIds.includes(id));

const canonicalIdentityCounts = new Map();
for (const moment of derivedMoments) {
  const identity = text(moment.metadata?.canonical_evidence_identity);
  canonicalIdentityCounts.set(identity, (canonicalIdentityCounts.get(identity) || 0) + 1);
}
const duplicateCanonicalIdentities = [...canonicalIdentityCounts.entries()]
  .filter(([, count]) => count > 1)
  .map(([identity, count]) => ({ identity, count }));

const completeCandidates = candidates.filter((candidate) =>
  upper(candidate.metadata?.ai_verification_status) === "COMPLETE" &&
  candidate.metadata?.dense_semantic_terminal === true &&
  candidate.metadata?.canonical_evidence_repair === true &&
  candidate.metadata?.canonical_evidence_repair_version === REPAIR_VERSION &&
  candidate.metadata?.production_started === false &&
  candidate.review?.ai_reviewed === true &&
  candidate.review?.human_reviewed === false &&
  candidate.review?.approved === false
);
const rejectedCandidates = candidates.filter(
  (candidate) => upper(candidate.metadata?.ai_verification_status) === "REJECTED",
);
const candidateFrameCount = candidates.reduce(
  (total, candidate) => total + (
    Array.isArray(candidate.metadata?.ai_verification_frame_results)
      ? candidate.metadata.ai_verification_frame_results.length
      : 0
  ),
  0,
);
const candidatePerformanceSeconds = sum(
  candidates.map((candidate) => candidate.metadata?.performance_duration_seconds),
);
const candidateHeroSeconds = sum(
  candidates.map((candidate) => candidate.metadata?.hero_duration_seconds),
);
const candidatePerformanceRangeCount = candidates.reduce(
  (total, candidate) => total + finite(candidate.metadata?.performance_range_count),
  0,
);
const candidateHeroRangeCount = candidates.reduce(
  (total, candidate) => total + finite(candidate.metadata?.hero_range_count),
  0,
);
const derivedPerformanceSeconds = sum(
  derivedMoments.map((moment) =>
    moment.metadata?.original_source_range?.duration_seconds ??
    moment.technical?.duration_seconds
  ),
);
const derivedHeroRanges = derivedMoments.flatMap((moment) =>
  Array.isArray(moment.metadata?.hero_subranges)
    ? moment.metadata.hero_subranges
    : []
);
const derivedHeroSeconds = sum(
  derivedHeroRanges.map((range) =>
    range?.original_source_range?.duration_seconds ??
    range?.relative_range?.duration_seconds
  ),
);

const approvalViolations = nodes.filter((node) =>
  (
    candidates.some((candidate) => candidate.id === node.id) ||
    derivedMoments.some((moment) => moment.id === node.id) ||
    report.id === node.id
  ) && (
    node.review?.human_reviewed === true ||
    node.review?.approved === true ||
    node.metadata?.production_started === true
  )
);

const failures = [];
function expect(condition, code, evidence = null) {
  if (!condition) failures.push({ code, evidence });
}

expect(candidates.length === EXPECTED_CANDIDATES,
  "CANDIDATE_COUNT_MISMATCH", candidates.length);
expect(completeCandidates.length === EXPECTED_CANDIDATES,
  "COMPLETE_CANDIDATE_COUNT_MISMATCH", completeCandidates.length);
expect(rejectedCandidates.length === 0,
  "REJECTED_CANDIDATES_REMAIN", rejectedCandidates.map((row) => row.id));
expect(candidateFrameCount === EXPECTED_FRAMES,
  "FRAME_COUNT_MISMATCH", candidateFrameCount);
expect(derivedMoments.length === EXPECTED_PERFORMANCE_RANGES,
  "DERIVED_PERFORMANCE_MOMENT_COUNT_MISMATCH", derivedMoments.length);
expect(uniqueCandidateMomentIds.length === EXPECTED_PERFORMANCE_RANGES,
  "UNIQUE_LINKED_MOMENT_COUNT_MISMATCH", uniqueCandidateMomentIds.length);
expect(candidateMomentIds.length === EXPECTED_PERFORMANCE_RANGES,
  "TOTAL_LINKED_MOMENT_COUNT_MISMATCH", candidateMomentIds.length);
expect(missingLinkedMomentIds.length === 0,
  "MISSING_LINKED_MOMENTS", missingLinkedMomentIds);
expect(orphanDerivedMomentIds.length === 0,
  "ORPHAN_DERIVED_MOMENTS", orphanDerivedMomentIds);
expect(duplicateCanonicalIdentities.length === 0,
  "DUPLICATE_CANONICAL_IDENTITIES", duplicateCanonicalIdentities);
expect(candidatePerformanceRangeCount === EXPECTED_PERFORMANCE_RANGES,
  "CANDIDATE_PERFORMANCE_RANGE_COUNT_MISMATCH", candidatePerformanceRangeCount);
expect(candidateHeroRangeCount === EXPECTED_HERO_RANGES,
  "CANDIDATE_HERO_RANGE_COUNT_MISMATCH", candidateHeroRangeCount);
expect(derivedHeroRanges.length === EXPECTED_HERO_RANGES,
  "DERIVED_HERO_RANGE_COUNT_MISMATCH", derivedHeroRanges.length);
expect(closeTo(candidatePerformanceSeconds, EXPECTED_PERFORMANCE_SECONDS),
  "CANDIDATE_PERFORMANCE_DURATION_MISMATCH", candidatePerformanceSeconds);
expect(closeTo(derivedPerformanceSeconds, EXPECTED_PERFORMANCE_SECONDS),
  "DERIVED_PERFORMANCE_DURATION_MISMATCH", derivedPerformanceSeconds);
expect(closeTo(candidateHeroSeconds, EXPECTED_HERO_SECONDS),
  "CANDIDATE_HERO_DURATION_MISMATCH", candidateHeroSeconds);
expect(closeTo(derivedHeroSeconds, EXPECTED_HERO_SECONDS),
  "DERIVED_HERO_DURATION_MISMATCH", derivedHeroSeconds);
expect(text(report.metadata?.dense_semantic_plan_identity) === planIdentity,
  "REPORT_PLAN_IDENTITY_MISMATCH", report.metadata?.dense_semantic_plan_identity);
expect(report.metadata?.canonical_evidence_repair === true,
  "REPORT_CANONICAL_REPAIR_FLAG_MISSING");
expect(report.metadata?.canonical_evidence_repair_version === REPAIR_VERSION,
  "REPORT_REPAIR_VERSION_MISMATCH", report.metadata?.canonical_evidence_repair_version);
expect(finite(report.metadata?.completed_ai_calls) === EXPECTED_FRAMES,
  "REPORT_COMPLETED_CALL_COUNT_MISMATCH", report.metadata?.completed_ai_calls);
expect(finite(report.metadata?.saved_provider_response_count) === EXPECTED_PARSED,
  "REPORT_PARSED_RESPONSE_COUNT_MISMATCH", report.metadata?.saved_provider_response_count);
expect(finite(report.metadata?.score_scale_0_10_frame_count) === EXPECTED_ZERO_TO_TEN,
  "REPORT_0_10_COUNT_MISMATCH", report.metadata?.score_scale_0_10_frame_count);
expect(finite(report.metadata?.score_scale_0_100_frame_count) === EXPECTED_ZERO_TO_HUNDRED,
  "REPORT_0_100_COUNT_MISMATCH", report.metadata?.score_scale_0_100_frame_count);
expect(finite(report.metadata?.verified_candidate_count) === EXPECTED_CANDIDATES,
  "REPORT_VERIFIED_CANDIDATE_COUNT_MISMATCH", report.metadata?.verified_candidate_count);
expect(finite(report.metadata?.rejected_candidate_count) === 0,
  "REPORT_REJECTED_CANDIDATE_COUNT_MISMATCH", report.metadata?.rejected_candidate_count);
expect(finite(report.metadata?.verified_moment_count) === EXPECTED_PERFORMANCE_RANGES,
  "REPORT_VERIFIED_MOMENT_COUNT_MISMATCH", report.metadata?.verified_moment_count);
expect(finite(report.metadata?.performance_range_count) === EXPECTED_PERFORMANCE_RANGES,
  "REPORT_PERFORMANCE_RANGE_COUNT_MISMATCH", report.metadata?.performance_range_count);
expect(finite(report.metadata?.hero_range_count) === EXPECTED_HERO_RANGES,
  "REPORT_HERO_RANGE_COUNT_MISMATCH", report.metadata?.hero_range_count);
expect(closeTo(report.metadata?.performance_duration_seconds, EXPECTED_PERFORMANCE_SECONDS),
  "REPORT_PERFORMANCE_DURATION_MISMATCH", report.metadata?.performance_duration_seconds);
expect(closeTo(report.metadata?.hero_duration_seconds, EXPECTED_HERO_SECONDS),
  "REPORT_HERO_DURATION_MISMATCH", report.metadata?.hero_duration_seconds);
expect(report.metadata?.human_approval_required === true,
  "REPORT_HUMAN_APPROVAL_REQUIREMENT_MISSING");
expect(report.metadata?.production_started === false,
  "REPORT_PRODUCTION_LOCK_MISSING");
expect(report.review?.human_reviewed === false && report.review?.approved === false,
  "REPORT_REVIEW_LOCK_MISSING", report.review);
expect(approvalViolations.length === 0,
  "APPROVAL_OR_PRODUCTION_VIOLATION", approvalViolations.map((row) => row.id));

console.log("============================================================");
console.log("COLE DENSE CANONICAL STATE AUDIT — READ ONLY");
console.log("============================================================");
console.log(`PROJECT_NODE_COUNT=${nodes.length}`);
console.log(`CANDIDATE_COUNT=${candidates.length}`);
console.log(`COMPLETE_CANDIDATE_COUNT=${completeCandidates.length}`);
console.log(`REJECTED_CANDIDATE_COUNT=${rejectedCandidates.length}`);
console.log(`CANDIDATE_FRAME_COUNT=${candidateFrameCount}`);
console.log(`DERIVED_PERFORMANCE_MOMENT_COUNT=${derivedMoments.length}`);
console.log(`LINKED_PERFORMANCE_MOMENT_COUNT=${uniqueCandidateMomentIds.length}`);
console.log(`MISSING_LINKED_MOMENT_COUNT=${missingLinkedMomentIds.length}`);
console.log(`ORPHAN_DERIVED_MOMENT_COUNT=${orphanDerivedMomentIds.length}`);
console.log(`DUPLICATE_CANONICAL_IDENTITY_COUNT=${duplicateCanonicalIdentities.length}`);
console.log(`PERFORMANCE_RANGE_COUNT=${candidatePerformanceRangeCount}`);
console.log(`PERFORMANCE_DURATION_SECONDS=${candidatePerformanceSeconds}`);
console.log(`HERO_RANGE_COUNT=${candidateHeroRangeCount}`);
console.log(`HERO_DURATION_SECONDS=${candidateHeroSeconds}`);
console.log(`REPORT_COMPLETED_AI_CALLS=${finite(report.metadata?.completed_ai_calls)}`);
console.log(`REPORT_SAVED_PROVIDER_RESPONSES=${finite(report.metadata?.saved_provider_response_count)}`);
console.log(`REPORT_SCORE_SCALE_0_10_FRAMES=${finite(report.metadata?.score_scale_0_10_frame_count)}`);
console.log(`REPORT_SCORE_SCALE_0_100_FRAMES=${finite(report.metadata?.score_scale_0_100_frame_count)}`);
console.log(`HUMAN_APPROVAL_REQUIRED=${report.metadata?.human_approval_required === true ? "YES" : "NO"}`);
console.log(`PRODUCTION_STARTED=${report.metadata?.production_started === true ? "YES" : "NO"}`);
console.log(`AUDIT_FAILURE_COUNT=${failures.length}`);
console.log(`AUDIT_FAILURES=${JSON.stringify(failures)}`);
console.log("PROVIDER_CALLS_EXECUTED_BY_AUDIT=0");
console.log("WALLET_CHARGES_CREATED_BY_AUDIT=0");
console.log("DATABASE_WRITES_BY_AUDIT=0");
console.log("============================================================");

if (failures.length) {
  process.exitCode = 1;
}
