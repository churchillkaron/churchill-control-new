import crypto from "node:crypto";

import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function flatten(value) {
  if (Array.isArray(value)) return value.flatMap(flatten);
  if (value && typeof value === "object") return Object.values(value).flatMap(flatten);
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

function tokens(value) {
  return [...new Set(
    flatten(value)
      .flatMap((item) => normalize(item).split(/\s+/))
      .filter(Boolean),
  )];
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function overlapTranscript(transcripts = [], start, end) {
  const segments = transcripts.flatMap((node) => node.metadata?.segments || []);
  const overlapping = segments.filter((segment) => {
    const segmentStart = finite(segment.start_seconds ?? segment.start);
    const segmentEnd = finite(segment.end_seconds ?? segment.end);
    return segmentStart !== null && segmentEnd !== null && segmentEnd > start && segmentStart < end;
  });

  return {
    text: overlapping.map((segment) => segment.text || "").filter(Boolean).join(" "),
    segments: overlapping,
  };
}

function evidenceDocument(clip, transcript) {
  return normalize([
    clip.name,
    clip.description,
    ...flatten(clip.intelligence),
    ...flatten(clip.metadata),
    transcript.text,
  ].join(" "));
}

function scoreRequirement(document, requirement = {}) {
  const required = tokens([
    requirement.subject,
    requirement.action,
    requirement.emotion,
    requirement.mood,
    requirement.location,
    requirement.actors,
    requirement.products,
    requirement.tags,
    requirement.dialogue,
    requirement.narration,
    requirement.brand_rules,
  ]);
  const forbidden = tokens([
    requirement.must_avoid,
    requirement.mustAvoid,
    requirement.forbidden,
  ]);
  const matched = required.filter((token) => document.includes(token));
  const blocked = forbidden.filter((token) => document.includes(token));

  return {
    semantic_coverage: required.length ? (matched.length / required.length) * 100 : null,
    matched_requirements: matched,
    missing_requirements: required.filter((token) => !matched.includes(token)),
    blocked_terms: blocked,
  };
}

function weightedScore(signals = {}, weights = {}) {
  const active = Object.entries(signals).filter(([, value]) => Number.isFinite(value));
  if (!active.length) return null;

  const supplied = active.some(([name]) => Number(weights[name]) > 0);
  let total = 0;
  let totalWeight = 0;

  for (const [name, value] of active) {
    const weight = supplied ? Math.max(0, Number(weights[name]) || 0) : 1;
    if (!weight) continue;
    total += value * weight;
    totalWeight += weight;
  }

  return totalWeight ? total / totalWeight : null;
}

function identity(parent, requirements, policy) {
  return crypto.createHash("sha256").update(JSON.stringify({
    parent_id: parent.id,
    checksum: parent.technical?.checksum || null,
    requirements,
    weights: policy?.weights || {},
  })).digest("hex");
}

export const CreativeMomentIntelligenceRuntime = {
  async analyze({
    organization_id,
    parent_asset_node_id,
    requirements = [],
    policy = {},
    force = false,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!parent_asset_node_id) throw new Error("parent_asset_node_id required");

    const parent = await AssetGraphRepository.getById(parent_asset_node_id);
    if (!parent || parent.organization_id !== organization_id) {
      throw new Error("Parent asset node not found");
    }

    const projectNodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id: parent.creative_project_id,
    });
    const clips = projectNodes.filter((node) =>
      node.parent_asset_node_id === parent.id &&
      node.metadata?.virtual_clip === true,
    );
    if (!clips.length) throw new Error("TEMPORAL_CLIPS_REQUIRED");

    const transcripts = projectNodes.filter((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.SUBTITLE &&
      (node.parent_asset_node_id === parent.id || node.metadata?.source_asset_node_id === parent.id) &&
      Array.isArray(node.metadata?.segments),
    );
    const requirementList = Array.isArray(requirements) && requirements.length
      ? requirements
      : [{}];
    const analysisIdentity = identity(parent, requirementList, policy);
    const existing = !force
      ? projectNodes.filter((node) =>
          node.type === CREATIVE_ASSET_NODE_TYPES.MOMENT &&
          node.metadata?.moment_analysis_identity === analysisIdentity,
        )
      : [];

    if (existing.length) return { moments: existing, reused: true };

    const moments = [];
    for (const clip of clips) {
      const range = clip.metadata?.clip_range || {};
      const start = finite(range.start_seconds);
      const end = finite(range.end_seconds);
      if (start === null || end === null || end <= start) continue;

      const transcript = overlapTranscript(transcripts, start, end);
      const document = evidenceDocument(clip, transcript);
      const matches = requirementList.map((requirement, index) => ({
        requirement_index: index,
        ...scoreRequirement(document, requirement),
      }));
      const best = [...matches].sort((a, b) =>
        Number(b.semantic_coverage ?? -1) - Number(a.semantic_coverage ?? -1),
      )[0];
      const quality = finite(clip.intelligence?.quality_score);
      const brand = finite(clip.intelligence?.brand_match_score);
      const cutStrength = finite(range.cut_score) !== null
        ? Math.max(0, Math.min(100, Number(range.cut_score) * 100))
        : null;
      const transcriptEvidence = transcript.segments.length ? 100 : null;
      const blocked = best?.blocked_terms?.length > 0;
      const score = blocked
        ? 0
        : weightedScore({
            semantic: best?.semantic_coverage,
            quality,
            brand,
            cut_strength: cutStrength,
            transcript_evidence: transcriptEvidence,
          }, policy.weights || {});
      const node = createCreativeAssetNode({
        organization_id,
        creative_project_id: parent.creative_project_id,
        creative_asset_id: parent.creative_asset_id,
        parent_asset_node_id: clip.id,
        type: CREATIVE_ASSET_NODE_TYPES.MOMENT,
        status: CREATIVE_ASSET_NODE_STATUS.DERIVED,
        name: `${clip.name || "Clip"} moment intelligence`,
        description: transcript.text,
        url: parent.url,
        storage_path: parent.storage_path || null,
        lineage: {
          source: "moment_intelligence",
          provider_id: null,
          capability: "media.moment.analyze",
          generation_version: policy.version || 1,
        },
        technical: {
          ...(clip.technical || {}),
          duration_seconds: end - start,
        },
        intelligence: {
          quality_score: quality,
          brand_match_score: brand,
          reuse_score: score,
          safety_status: blocked ? "BLOCKED" : (clip.intelligence?.safety_status || "UNKNOWN"),
          tags: [...new Set([
            ...(clip.intelligence?.tags || []),
            ...(best?.matched_requirements || []),
          ])],
          detected_products: clip.intelligence?.detected_products || [],
          detected_people: clip.intelligence?.detected_people || [],
          detected_locations: clip.intelligence?.detected_locations || [],
        },
        reuse: {
          reusable: false,
          approved_for_reuse: false,
        },
        review: {
          ai_reviewed: true,
          human_reviewed: false,
          approved: false,
        },
        metadata: {
          moment_analysis_identity: analysisIdentity,
          source_asset_node_id: parent.id,
          source_clip_node_id: clip.id,
          clip_range: { start_seconds: start, end_seconds: end, duration_seconds: end - start },
          transcript_segments: transcript.segments,
          requirement_matches: matches,
          best_requirement_match: best || null,
          score,
          score_signals: {
            semantic: best?.semantic_coverage ?? null,
            quality,
            brand,
            cut_strength: cutStrength,
            transcript_evidence: transcriptEvidence,
          },
          blocked,
          created_at: new Date().toISOString(),
        },
      });

      moments.push(await AssetGraphRepository.create(node));
    }

    return { moments, reused: false };
  },
};
