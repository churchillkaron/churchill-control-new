#!/usr/bin/env node

import crypto from "node:crypto";
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

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
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

function clamp(value, minimum = 0, maximum = 100) {
  return Math.max(minimum, Math.min(maximum, finite(value, minimum)));
}

function average(values = [], fallback = 0) {
  const numbers = values
    .map((value) => finite(value, null))
    .filter((value) => value !== null);
  if (!numbers.length) return fallback;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
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
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Continue with the next conservative extraction.
    }
  }
  return null;
}

function rawAnalysis(value = {}) {
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
      x: Math.max(0, Math.min(1, finite(anchor.x, 0.5))),
      y: Math.max(0, Math.min(1, finite(anchor.y, 0.5))),
    },
    crop_safety: source.crop_safety || null,
    occlusion_risk: upper(source.occlusion_risk) || "UNKNOWN",
    reasons: Array.isArray(source.reasons)
      ? source.reasons.map(text).filter(Boolean)
      : [],
  };
}

function scoreScale(analysis, frame = {}) {
  if (!analysis) return 1;
  const values = [
    analysis.face_visibility_score,
    analysis.technical_quality_score,
    analysis.performance_energy_score,
  ].map((value) => finite(value, null)).filter((value) => value !== null);
  if (!values.length) return 1;
  const maximum = Math.max(...values);
  const minimum = Math.min(...values);

  // The first paid checkpoint for every candidate came from the original v2
  // prompt, which explicitly required 0-100 scores. Recovery-created frames
  // are marked reused=false and came from the v1 recovery prompt that omitted
  // the score scale. Those responses consistently used 0-10.
  if (frame.reused === false && minimum >= 0 && maximum <= 10) return 10;
  if (frame.reused === true) return 1;
  return minimum >= 0 && maximum <= 10 ? 10 : 1;
}

function canonicalAnalysis(parsed, frame = {}) {
  const raw = rawAnalysis(parsed);
  const multiplier = scoreScale(raw, frame);
  return {
    ...raw,
    face_visibility_score: clamp(raw.face_visibility_score * multiplier),
    technical_quality_score: clamp(raw.technical_quality_score * multiplier),
    performance_energy_score: clamp(raw.performance_energy_score * multiplier),
    source_score_scale: multiplier === 10 ? "0_10" : "0_100",
    score_multiplier: multiplier,
    raw_scores: {
      face_visibility_score: raw.face_visibility_score,
      technical_quality_score: raw.technical_quality_score,
      performance_energy_score: raw.performance_energy_score,
    },
  };
}

function completed(frame) {
  return upper(frame?.status || "COMPLETED") === "COMPLETED";
}

function verified(frame) {
  return completed(frame) && upper(frame?.analysis?.status) === "VERIFIED";
}

function nonHighOcclusion(frame) {
  return upper(frame?.analysis?.occlusion_risk) !== "HIGH";
}

function candidateEvidence(frames) {
  const completedFrames = frames.filter(completed);
  const directLeadFrames = completedFrames.filter((frame) => Boolean(
    verified(frame) &&
    frame.analysis?.primary_performer_present === true &&
    frame.analysis?.lead_vocalist_present === true &&
    frame.analysis?.microphone_visible === true &&
    nonHighOcclusion(frame)
  ));
  const primaryFrames = completedFrames.filter(
    (frame) => frame.analysis?.primary_performer_present === true,
  );
  const leadFrames = completedFrames.filter(
    (frame) => frame.analysis?.lead_vocalist_present === true,
  );
  const directRatio = directLeadFrames.length / Math.max(1, completedFrames.length);
  const primaryRatio = primaryFrames.length / Math.max(1, completedFrames.length);
  const leadRatio = leadFrames.length / Math.max(1, completedFrames.length);
  const established =
    directLeadFrames.length >= 2 ||
    (directLeadFrames.length >= 1 && directRatio >= 0.1 && primaryRatio >= 0.6 && leadRatio >= 0.5);
  return {
    established,
    completed_frame_count: completedFrames.length,
    direct_lead_frame_count: directLeadFrames.length,
    direct_lead_ratio: Number(directRatio.toFixed(6)),
    primary_ratio: Number(primaryRatio.toFixed(6)),
    lead_ratio: Number(leadRatio.toFixed(6)),
  };
}

function heroFrame(frame, evidence) {
  const analysis = frame.analysis;
  return Boolean(
    evidence.established &&
    verified(frame) &&
    analysis?.primary_performer_present === true &&
    analysis?.lead_vocalist_present === true &&
    analysis?.microphone_visible === true &&
    analysis?.usable_for_showreel === true &&
    analysis?.technical_quality_score >= 55 &&
    analysis?.face_visibility_score >= 50 &&
    analysis?.performance_energy_score >= 45 &&
    nonHighOcclusion(frame) &&
    ["CLOSE_UP", "MEDIUM"].includes(upper(analysis?.framing))
  );
}

function performanceFrame(frame, evidence) {
  const analysis = frame.analysis;
  return Boolean(
    evidence.established &&
    verified(frame) &&
    analysis?.primary_performer_present === true &&
    (analysis?.lead_vocalist_present === true || analysis?.microphone_visible === true) &&
    analysis?.technical_quality_score >= 45 &&
    nonHighOcclusion(frame)
  );
}

function contextFrame(frame, evidence) {
  const analysis = frame.analysis;
  return Boolean(
    evidence.established &&
    verified(frame) &&
    analysis?.technical_quality_score >= 40 &&
    nonHighOcclusion(frame)
  );
}

function rangesFor(frames, duration, predicate) {
  const ordered = [...frames].sort(
    (left, right) => finite(left.sample_index) - finite(right.sample_index),
  );
  if (!ordered.length || duration <= 0) return [];
  const points = ordered.map((frame) => finite(frame.relative_time_seconds));
  const cells = ordered.map((frame, index) => ({
    accepted: predicate(frame),
    sample_index: finite(frame.sample_index, index),
    start_seconds: index === 0
      ? 0
      : (points[index - 1] + points[index]) / 2,
    end_seconds: index === ordered.length - 1
      ? duration
      : (points[index] + points[index + 1]) / 2,
  }));
  const groups = [];
  for (const cell of cells) {
    if (!cell.accepted) continue;
    const previous = groups.at(-1);
    if (previous && Math.abs(previous.end_seconds - cell.start_seconds) <= 0.001) {
      previous.end_seconds = cell.end_seconds;
      previous.sample_indexes.push(cell.sample_index);
    } else {
      groups.push({
        start_seconds: cell.start_seconds,
        end_seconds: cell.end_seconds,
        sample_indexes: [cell.sample_index],
      });
    }
  }
  return groups
    .map((group) => ({
      start_seconds: Number(group.start_seconds.toFixed(6)),
      end_seconds: Number(group.end_seconds.toFixed(6)),
      duration_seconds: Number((group.end_seconds - group.start_seconds).toFixed(6)),
      sample_indexes: group.sample_indexes,
    }))
    .filter((range) => range.duration_seconds >= 0.75);
}

function intersects(left, right) {
  return left.start_seconds < right.end_seconds && right.start_seconds < left.end_seconds;
}

function intersection(left, right) {
  if (!intersects(left, right)) return null;
  const start = Math.max(left.start_seconds, right.start_seconds);
  const end = Math.min(left.end_seconds, right.end_seconds);
  if (end <= start) return null;
  return {
    start_seconds: Number(start.toFixed(6)),
    end_seconds: Number(end.toFixed(6)),
    duration_seconds: Number((end - start).toFixed(6)),
  };
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
const planIdentity = text(process.env.COLE_LEY_DENSE_PLAN_IDENTITY);
const authorized = upper(process.env.COLE_DENSE_CANONICAL_REPAIR_AUTHORIZED) === "YES";

if (!organizationId) throw new Error("CREATIVE_SMOKE_ORGANIZATION_ID required");
if (!projectId) throw new Error("COLE_LEY_PROJECT_ID required");
if (!shortlistIdentity) throw new Error("COLE_LEY_PROJECT_SHORTLIST_IDENTITY required");
if (!planIdentity) throw new Error("COLE_LEY_DENSE_PLAN_IDENTITY required");
if (!authorized) throw new Error("COLE_DENSE_CANONICAL_REPAIR_AUTHORIZED=YES required");

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} = await import("@/lib/creative/assets/graph/documents/CreativeAssetNode");
const AssetGraphRepository = await import(
  "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository"
);
const { DENSE_SEMANTIC_RUNTIME_VERSION } = await import(
  "@/lib/creative/media/runtime/CreativeDenseSemanticPlanRuntime"
);

const nodes = await AssetGraphRepository.listByProject({
  organization_id: organizationId,
  creative_project_id: projectId,
});
const report = nodes
  .filter((node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT &&
    node.metadata?.project_shortlist_report === true &&
    node.metadata?.project_shortlist_identity === shortlistIdentity &&
    node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED
  )
  .sort((left, right) =>
    Date.parse(right.created_at || 0) - Date.parse(left.created_at || 0)
  )[0] || null;
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
if (candidates.length !== EXPECTED_CANDIDATES) {
  throw new Error(`COLE_DENSE_CANDIDATE_COUNT_MISMATCH:${candidates.length}`);
}

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

let totalFrames = 0;
let parsedCount = 0;
let missingCount = 0;
let zeroToTenCount = 0;
let zeroToHundredCount = 0;
let performanceSeconds = 0;
let heroSeconds = 0;
let performanceRangeCount = 0;
let heroRangeCount = 0;
const prepared = [];

for (const candidate of candidates) {
  if (text(candidate.metadata?.dense_semantic_execution_identity) !== planIdentity) {
    throw new Error(`COLE_DENSE_PLAN_IDENTITY_MISMATCH:${candidate.id}`);
  }
  const sourceRange = object(candidate.metadata?.original_source_range);
  const sourceStart = finite(sourceRange.start_seconds, -1);
  const sourceEnd = finite(sourceRange.end_seconds, -1);
  const duration = finite(
    sourceRange.duration_seconds,
    sourceEnd > sourceStart ? sourceEnd - sourceStart : -1,
  );
  if (sourceStart < 0 || duration <= 0) {
    throw new Error(`COLE_DENSE_SOURCE_RANGE_INVALID:${candidate.id}`);
  }
  const storedFrames = Array.isArray(candidate.metadata?.ai_verification_frame_results)
    ? candidate.metadata.ai_verification_frame_results
    : [];
  totalFrames += storedFrames.length;
  const frames = [];

  for (const frame of storedFrames) {
    const usage = usageById.get(String(frame.usage_id || ""));
    const providerText = savedProviderText(usage);
    const parsed = parseJson(providerText);
    if (!parsed) {
      missingCount += 1;
      frames.push({
        ...frame,
        accepted: false,
        editorial_role: "REJECTED",
        analysis: null,
        canonical_evidence_repair_version: REPAIR_VERSION,
        canonical_evidence_error: usage
          ? "SAVED_PROVIDER_TEXT_INVALID"
          : "USAGE_ROW_NOT_FOUND",
      });
      continue;
    }
    parsedCount += 1;
    const analysis = canonicalAnalysis(parsed, frame);
    if (analysis.source_score_scale === "0_10") zeroToTenCount += 1;
    else zeroToHundredCount += 1;
    frames.push({
      ...frame,
      analysis,
      accepted: false,
      editorial_role: "REJECTED",
      canonical_evidence_repair_version: REPAIR_VERSION,
      canonical_evidence_error: null,
    });
  }

  const evidence = candidateEvidence(frames);
  if (!evidence.established) {
    throw new Error(`COLE_DENSE_PERFORMANCE_NOT_ESTABLISHED:${candidate.id}`);
  }

  for (const frame of frames) {
    if (heroFrame(frame, evidence)) {
      frame.accepted = true;
      frame.editorial_role = "HERO";
    } else if (performanceFrame(frame, evidence)) {
      frame.accepted = true;
      frame.editorial_role = "PERFORMANCE";
    } else if (contextFrame(frame, evidence)) {
      frame.editorial_role = "CONTEXT";
    }
  }

  const performanceRanges = rangesFor(
    frames,
    duration,
    (frame) => performanceFrame(frame, evidence),
  );
  const heroRanges = rangesFor(
    frames,
    duration,
    (frame) => heroFrame(frame, evidence),
  );
  if (!performanceRanges.length) {
    throw new Error(`COLE_DENSE_PERFORMANCE_RANGE_REQUIRED:${candidate.id}`);
  }

  performanceRangeCount += performanceRanges.length;
  heroRangeCount += heroRanges.length;
  performanceSeconds += performanceRanges.reduce(
    (sum, range) => sum + range.duration_seconds,
    0,
  );
  heroSeconds += heroRanges.reduce(
    (sum, range) => sum + range.duration_seconds,
    0,
  );

  prepared.push({
    candidate,
    sourceRange: {
      start_seconds: sourceStart,
      end_seconds: sourceStart + duration,
      duration_seconds: duration,
    },
    frames,
    evidence,
    performanceRanges,
    heroRanges,
  });
}

if (totalFrames !== EXPECTED_FRAMES) {
  throw new Error(`COLE_DENSE_FRAME_COUNT_MISMATCH:${totalFrames}`);
}
if (parsedCount !== EXPECTED_PARSED) {
  throw new Error(`COLE_DENSE_PARSED_COUNT_MISMATCH:${parsedCount}`);
}
if (missingCount !== EXPECTED_MISSING) {
  throw new Error(`COLE_DENSE_MISSING_COUNT_MISMATCH:${missingCount}`);
}
if (zeroToTenCount !== EXPECTED_ZERO_TO_TEN) {
  throw new Error(`COLE_DENSE_0_10_COUNT_MISMATCH:${zeroToTenCount}`);
}
if (zeroToHundredCount !== EXPECTED_ZERO_TO_HUNDRED) {
  throw new Error(`COLE_DENSE_0_100_COUNT_MISMATCH:${zeroToHundredCount}`);
}

const repairedCandidates = [];
const createdMoments = [];

for (const item of prepared) {
  const parent = await AssetGraphRepository.getById(
    item.candidate.metadata?.source_asset_node_id,
  );
  if (!parent?.id || !parent?.url) {
    throw new Error(`COLE_DENSE_SOURCE_NODE_REQUIRED:${item.candidate.id}`);
  }
  const momentIds = [];

  for (const range of item.performanceRanges) {
    const absoluteRange = {
      start_seconds: Number((item.sourceRange.start_seconds + range.start_seconds).toFixed(6)),
      end_seconds: Number((item.sourceRange.start_seconds + range.end_seconds).toFixed(6)),
      duration_seconds: range.duration_seconds,
    };
    const rangeFrames = item.frames.filter((frame) =>
      range.sample_indexes.includes(finite(frame.sample_index, -1))
    );
    const heroSubranges = item.heroRanges
      .map((heroRange) => intersection(range, heroRange))
      .filter(Boolean)
      .map((heroRange) => ({
        relative_range: heroRange,
        original_source_range: {
          start_seconds: Number((item.sourceRange.start_seconds + heroRange.start_seconds).toFixed(6)),
          end_seconds: Number((item.sourceRange.start_seconds + heroRange.end_seconds).toFixed(6)),
          duration_seconds: heroRange.duration_seconds,
        },
      }));
    const quality = average(
      rangeFrames.map((frame) => frame.analysis?.technical_quality_score),
    );
    const face = average(
      rangeFrames.map((frame) => frame.analysis?.face_visibility_score),
    );
    const energy = average(
      rangeFrames.map((frame) => frame.analysis?.performance_energy_score),
    );
    const editorialScore = clamp(quality * 0.45 + face * 0.25 + energy * 0.3);
    const identity = hash({
      repair_version: REPAIR_VERSION,
      candidate_id: item.candidate.id,
      candidate_plan_identity: item.candidate.metadata?.dense_semantic_plan_identity,
      original_source_range: absoluteRange,
    });
    const node = createCreativeAssetNode({
      organization_id: organizationId,
      creative_project_id: projectId,
      creative_asset_id: parent.creative_asset_id,
      parent_asset_node_id: parent.id,
      type: CREATIVE_ASSET_NODE_TYPES.MOMENT,
      status: CREATIVE_ASSET_NODE_STATUS.DERIVED,
      name: `${parent.name || "Source video"} verified performance range`,
      description:
        "Canonical dense evidence verified this exact source range as usable live-performance coverage.",
      url: parent.url,
      storage_path: parent.storage_path || null,
      lineage: {
        source: "dense_semantic_saved_response_repair",
        provider_id: "openai",
        capability: "ai.image.analyze",
        generation_version: 4,
      },
      technical: {
        ...object(parent.technical),
        duration_seconds: absoluteRange.duration_seconds,
        media_kind: "video",
      },
      intelligence: {
        quality_score: quality,
        reuse_score: editorialScore,
        safety_status: "REVIEW_REQUIRED",
        tags: [
          "dense-semantic-verification",
          "canonical-score-scale",
          "lead-performance-established",
          "exact-source-range",
          ...(heroSubranges.length ? ["contains-hero-performance"] : []),
        ],
      },
      review: {
        ai_reviewed: true,
        human_reviewed: false,
        approved: false,
        notes:
          "Saved provider evidence was repaired and canonicalised; human editorial approval remains required.",
      },
      metadata: {
        dense_semantic_verification: true,
        canonical_evidence_repair: true,
        canonical_evidence_repair_version: REPAIR_VERSION,
        canonical_evidence_identity: identity,
        dense_semantic_plan_identity:
          item.candidate.metadata?.dense_semantic_plan_identity,
        dense_semantic_execution_identity: planIdentity,
        verification_runtime_version: DENSE_SEMANTIC_RUNTIME_VERSION,
        performance_verified: true,
        performance_established: true,
        source_asset_node_id: parent.id,
        render_source_asset_node_id: parent.id,
        local_shortlist_candidate_id: item.candidate.id,
        project_shortlist_identity: shortlistIdentity,
        original_source_range: absoluteRange,
        original_source_range_exact: true,
        render_source_range: absoluteRange,
        clip_range: absoluteRange,
        editorial_role: heroSubranges.length ? "PERFORMANCE_WITH_HERO" : "PERFORMANCE",
        hero_subranges: heroSubranges,
        performance_evidence: {
          usable: true,
          section: range,
          frames: rangeFrames,
          candidate_evidence: item.evidence,
          score: editorialScore,
          quality_score: quality,
          face_visibility_score: face,
          performance_energy_score: energy,
          verified_sample_count: rangeFrames.length,
        },
        score: editorialScore,
        original_audio_preserved: true,
        exact_lip_sync_required: true,
        human_approval_required: true,
        production_started: false,
      },
    });
    const created = await AssetGraphRepository.createOrFindByMetadataIdentity({
      node,
      metadata_key: "canonical_evidence_identity",
      metadata_value: identity,
    });
    momentIds.push(created.node.id);
    createdMoments.push(created.node);
  }

  const repaired = await AssetGraphRepository.update(item.candidate.id, {
    review: {
      ...object(item.candidate.review),
      ai_reviewed: true,
      human_reviewed: false,
      approved: false,
      notes:
        "Dense saved responses repaired to canonical score scale; human editorial approval remains required.",
    },
    metadata: {
      ...object(item.candidate.metadata),
      ai_verification_status: "COMPLETE",
      ai_verification_completed_at: new Date().toISOString(),
      paid_analysis_calls: item.frames.length,
      ai_verification_frame_results: item.frames,
      verified_moment_ids: momentIds,
      ai_verification_error: null,
      verification_runtime_version: DENSE_SEMANTIC_RUNTIME_VERSION,
      canonical_evidence_repair: true,
      canonical_evidence_repair_version: REPAIR_VERSION,
      canonical_evidence_repaired_at: new Date().toISOString(),
      canonical_score_scale: "0_100",
      performance_evidence: item.evidence,
      performance_range_count: item.performanceRanges.length,
      performance_duration_seconds: Number(item.performanceRanges.reduce(
        (sum, range) => sum + range.duration_seconds,
        0,
      ).toFixed(6)),
      hero_range_count: item.heroRanges.length,
      hero_duration_seconds: Number(item.heroRanges.reduce(
        (sum, range) => sum + range.duration_seconds,
        0,
      ).toFixed(6)),
      dense_semantic_terminal: true,
      dense_semantic_verification: true,
      production_started: false,
    },
  });
  repairedCandidates.push(repaired);
}

performanceSeconds = Number(performanceSeconds.toFixed(6));
heroSeconds = Number(heroSeconds.toFixed(6));

await AssetGraphRepository.update(report.id, {
  status: CREATIVE_ASSET_NODE_STATUS.GENERATED,
  review: {
    ...object(report.review),
    ai_reviewed: true,
    human_reviewed: false,
    approved: false,
    notes:
      "Dense semantic evidence repaired from saved provider responses; human editorial approval remains required.",
  },
  metadata: {
    ...object(report.metadata),
    completed_ai_calls: EXPECTED_FRAMES,
    verified_candidate_count: repairedCandidates.length,
    rejected_candidate_count: 0,
    verified_moment_count: createdMoments.length,
    performance_range_count: performanceRangeCount,
    hero_range_count: heroRangeCount,
    performance_duration_seconds: performanceSeconds,
    hero_duration_seconds: heroSeconds,
    dense_semantic_verification_status: "COMPLETE",
    dense_semantic_plan_identity: planIdentity,
    verification_runtime_version: DENSE_SEMANTIC_RUNTIME_VERSION,
    canonical_evidence_repair: true,
    canonical_evidence_repair_version: REPAIR_VERSION,
    canonical_evidence_repaired_at: new Date().toISOString(),
    saved_provider_response_count: parsedCount,
    score_scale_0_10_frame_count: zeroToTenCount,
    score_scale_0_100_frame_count: zeroToHundredCount,
    human_approval_required: true,
    production_started: false,
  },
});

const refreshedNodes = await AssetGraphRepository.listByProject({
  organization_id: organizationId,
  creative_project_id: projectId,
});
const refreshedCandidates = refreshedNodes.filter((node) =>
  node.type === CREATIVE_ASSET_NODE_TYPES.MOMENT &&
  node.metadata?.local_shortlist_candidate === true &&
  node.metadata?.project_shortlist_identity === shortlistIdentity
);
const canonicalMoments = refreshedNodes.filter((node) =>
  node.type === CREATIVE_ASSET_NODE_TYPES.MOMENT &&
  node.metadata?.canonical_evidence_repair_version === REPAIR_VERSION &&
  node.metadata?.project_shortlist_identity === shortlistIdentity
);
const completeCandidates = refreshedCandidates.filter((candidate) =>
  upper(candidate.metadata?.ai_verification_status) === "COMPLETE" &&
  candidate.metadata?.dense_semantic_terminal === true &&
  candidate.metadata?.production_started === false
);
if (completeCandidates.length !== EXPECTED_CANDIDATES) {
  throw new Error(`COLE_DENSE_REPAIR_VALIDATION_FAILED:${completeCandidates.length}`);
}
if (canonicalMoments.length !== performanceRangeCount) {
  throw new Error(
    `COLE_DENSE_MOMENT_COUNT_MISMATCH:${canonicalMoments.length}:${performanceRangeCount}`,
  );
}

console.log("============================================================");
console.log("COLE DENSE CANONICAL EVIDENCE REPAIR COMPLETE");
console.log("============================================================");
console.log(`REPAIR_VERSION=${REPAIR_VERSION}`);
console.log(`CANDIDATE_COUNT=${candidates.length}`);
console.log(`COMPLETED_AI_CALLS_PRESERVED=${totalFrames}`);
console.log(`SAVED_PROVIDER_RESPONSES_PARSED=${parsedCount}`);
console.log(`MISSING_PROVIDER_RESPONSE_COUNT=${missingCount}`);
console.log(`SCORE_SCALE_0_10_FRAME_COUNT=${zeroToTenCount}`);
console.log(`SCORE_SCALE_0_100_FRAME_COUNT=${zeroToHundredCount}`);
console.log(`VERIFIED_CANDIDATE_COUNT=${completeCandidates.length}`);
console.log(`REJECTED_CANDIDATE_COUNT=0`);
console.log(`VERIFIED_MOMENT_COUNT=${canonicalMoments.length}`);
console.log(`PERFORMANCE_RANGE_COUNT=${performanceRangeCount}`);
console.log(`PERFORMANCE_DURATION_SECONDS=${performanceSeconds}`);
console.log(`HERO_RANGE_COUNT=${heroRangeCount}`);
console.log(`HERO_DURATION_SECONDS=${heroSeconds}`);
console.log("HUMAN_APPROVAL_REQUIRED=YES");
console.log("PROVIDER_CALLS_EXECUTED=0");
console.log("WALLET_CHARGES_CREATED=0");
console.log("PRODUCTION_STARTED=NO");
console.log("============================================================");
