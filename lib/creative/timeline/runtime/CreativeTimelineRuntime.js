import crypto from "node:crypto";

import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sourceRange(moment) {
  const range = moment.metadata?.clip_range || {};
  const start = finite(range.start_seconds);
  const end = finite(range.end_seconds);
  if (start === null || end === null || end <= start) return null;
  return { start_seconds: start, end_seconds: end, duration_seconds: end - start };
}

function score(moment) {
  return finite(moment.metadata?.score ?? moment.intelligence?.reuse_score) ?? Number.NEGATIVE_INFINITY;
}

function requirementIndex(moment) {
  const value = Number(moment.metadata?.best_requirement_match?.requirement_index);
  return Number.isInteger(value) ? value : null;
}

function identity(projectId, requirements, options, moments) {
  return crypto.createHash("sha256").update(JSON.stringify({
    project_id: projectId,
    requirements,
    options,
    moments: moments.map((moment) => ({
      id: moment.id,
      range: moment.metadata?.clip_range,
      score: moment.metadata?.score,
    })),
  })).digest("hex");
}

function candidate(moments, used, minimumScore, index = null) {
  return moments
    .filter((moment) =>
      !used.has(moment.id) &&
      moment.metadata?.blocked !== true &&
      score(moment) >= minimumScore &&
      (index === null || requirementIndex(moment) === index),
    )
    .sort((left, right) => score(right) - score(left))[0] || null;
}

export const CreativeTimelineRuntime = {
  async compose({
    organization_id,
    creative_project_id,
    requirements = [],
    options = {},
    force = false,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");

    const nodes = await AssetGraphRepository.listByProject({ organization_id, creative_project_id });
    const moments = nodes.filter((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.MOMENT &&
      node.metadata?.blocked !== true &&
      sourceRange(node),
    );
    if (!moments.length) throw new Error("SEMANTIC_MOMENTS_REQUIRED");

    const requirementList = Array.isArray(requirements) ? requirements : [];
    const minimumScore = finite(options.minimum_score ?? options.minimumScore) ?? Number.NEGATIVE_INFINITY;
    const maximumDuration = finite(options.maximum_duration_seconds ?? options.maximumDurationSeconds);
    const maximumClips = finite(options.maximum_clips ?? options.maximumClips);
    const allowFallback = options.allow_fallback !== false && options.allowFallback !== false;
    const timelineIdentity = identity(creative_project_id, requirementList, options, moments);
    const existing = !force
      ? nodes.find((node) =>
          node.type === CREATIVE_ASSET_NODE_TYPES.TIMELINE &&
          node.metadata?.timeline_identity === timelineIdentity,
        )
      : null;

    if (existing) return { timeline: existing, reused: true };

    const selected = [];
    const missing = [];
    const used = new Set();
    let cursor = 0;
    const requested = requirementList.length ? requirementList : [null];

    for (let index = 0; index < requested.length; index += 1) {
      if (maximumClips !== null && selected.length >= maximumClips) break;
      if (maximumDuration !== null && cursor >= maximumDuration) break;

      let moment = requirementList.length ? candidate(moments, used, minimumScore, index) : candidate(moments, used, minimumScore);
      if (!moment && requirementList.length && allowFallback) moment = candidate(moments, used, minimumScore);
      if (!moment) {
        if (requirementList.length) missing.push({ requirement_index: index, reason: "MATCHING_MOMENT_NOT_FOUND" });
        continue;
      }

      const range = sourceRange(moment);
      const remaining = maximumDuration !== null ? maximumDuration - cursor : range.duration_seconds;
      const duration = Math.min(range.duration_seconds, remaining);
      if (duration <= 0) break;
      const requirement = requirementList[index] || {};

      selected.push({
        index: selected.length + 1,
        requirement_index: requirementList.length ? index : null,
        source_asset_node_id: moment.metadata?.source_asset_node_id || null,
        source_clip_node_id: moment.metadata?.source_clip_node_id || moment.parent_asset_node_id,
        source_moment_node_id: moment.id,
        source_url: moment.url,
        source_in_seconds: range.start_seconds,
        source_out_seconds: range.start_seconds + duration,
        timeline_in_seconds: cursor,
        timeline_out_seconds: cursor + duration,
        duration_seconds: duration,
        selection_score: finite(moment.metadata?.score),
        selection_evidence: {
          signals: moment.metadata?.score_signals || {},
          requirement_match: moment.metadata?.best_requirement_match || null,
          transcript_segments: moment.metadata?.transcript_segments || [],
        },
        transition_in: requirement.transition_in || null,
        transition_out: requirement.transition_out || null,
      });
      used.add(moment.id);
      cursor += duration;

      if (!requirementList.length && (maximumClips === null || selected.length < maximumClips)) {
        requested.push(null);
        if (used.size >= moments.length) break;
      }
    }

    if (!selected.length) throw new Error("TIMELINE_HAS_NO_ELIGIBLE_CLIPS");

    const node = createCreativeAssetNode({
      organization_id,
      creative_project_id,
      type: CREATIVE_ASSET_NODE_TYPES.TIMELINE,
      status: missing.length ? CREATIVE_ASSET_NODE_STATUS.REVIEW : CREATIVE_ASSET_NODE_STATUS.DERIVED,
      name: options.name || "Creative timeline",
      description: options.description || "",
      lineage: {
        source: "semantic_timeline_composition",
        provider_id: null,
        capability: "creative.timeline.compose",
        generation_version: options.version || 1,
      },
      technical: {
        mime_type: "application/vnd.avantiqo.edl+json",
        duration_seconds: cursor,
      },
      intelligence: {
        quality_score: null,
        brand_match_score: null,
        reuse_score: null,
        safety_status: "UNKNOWN",
        tags: Array.isArray(options.tags) ? options.tags : [],
      },
      reuse: { reusable: false, approved_for_reuse: false },
      review: { ai_reviewed: true, human_reviewed: false, approved: false },
      metadata: {
        timeline_identity: timelineIdentity,
        format: "AVANTIQO_EDL_V1",
        edit_decision_list: selected,
        requirements: requirementList,
        missing_requirements: missing,
        total_duration_seconds: cursor,
        clip_count: selected.length,
        composition_options: options,
        created_at: new Date().toISOString(),
      },
    });

    return { timeline: await AssetGraphRepository.create(node), reused: false };
  },

  async build(input = {}) {
    return this.compose(input);
  },

  async resolve(input = {}, permissions = []) {
    const current = await this.compose(input);
    return {
      current,
      items: current?.timeline?.metadata?.edit_decision_list || [],
      commands: ["compose", "build"],
      status: current?.timeline?.status || "ready",
      permissions,
    };
  },
};
