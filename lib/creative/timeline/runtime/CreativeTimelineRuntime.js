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

function sourceIdentity(moment) {
  return String(
    moment.metadata?.source_asset_node_id ||
    moment.creative_asset_id ||
    moment.parent_asset_node_id ||
    moment.id,
  );
}

function enabled(options, snake, camel) {
  return options?.[snake] === true || options?.[camel] === true;
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
      performance_verified: moment.metadata?.performance_verified === true,
      source_asset_node_id: moment.metadata?.source_asset_node_id || null,
    })),
  })).digest("hex");
}

function choose({ moments, used, minimumScore, requirement = null, sourceCounts, maximumPerSource }) {
  return moments
    .filter((moment) => {
      if (used.has(moment.id) || moment.metadata?.blocked === true) return false;
      if (score(moment) < minimumScore) return false;
      if (requirement !== null && requirementIndex(moment) !== requirement) return false;
      if (maximumPerSource !== null) {
        const count = sourceCounts.get(sourceIdentity(moment)) || 0;
        if (count >= maximumPerSource) return false;
      }
      return true;
    })
    .sort((left, right) => score(right) - score(left))[0] || null;
}

function validationError(message, validation) {
  const error = new Error(message);
  error.validation = validation;
  return error;
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
    const verifiedOnly = enabled(options, "performance_verified_only", "performanceVerifiedOnly");
    const moments = nodes.filter((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.MOMENT &&
      node.metadata?.blocked !== true &&
      sourceRange(node) &&
      (!verifiedOnly || node.metadata?.performance_verified === true),
    );
    if (!moments.length) {
      throw new Error(verifiedOnly ? "VERIFIED_PERFORMANCE_MOMENTS_REQUIRED" : "SEMANTIC_MOMENTS_REQUIRED");
    }

    const requirementList = Array.isArray(requirements) ? requirements : [];
    const minimumScore = finite(options.minimum_score ?? options.minimumScore) ?? Number.NEGATIVE_INFINITY;
    const maximumDuration = finite(options.maximum_duration_seconds ?? options.maximumDurationSeconds);
    const minimumDuration = finite(options.minimum_duration_seconds ?? options.minimumDurationSeconds);
    const maximumClips = finite(options.maximum_clips ?? options.maximumClips);
    const maximumPerSource = finite(options.maximum_clips_per_source ?? options.maximumClipsPerSource);
    const minimumDistinctSources = finite(options.minimum_distinct_sources ?? options.minimumDistinctSources);
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
    const sourceCounts = new Map();
    let cursor = 0;

    const append = (moment, requirement = null, requirementPosition = null) => {
      const range = sourceRange(moment);
      const remaining = maximumDuration !== null ? maximumDuration - cursor : range.duration_seconds;
      const duration = Math.min(range.duration_seconds, remaining);
      if (duration <= 0) return false;
      const sourceId = sourceIdentity(moment);
      selected.push({
        index: selected.length + 1,
        requirement_index: requirementPosition,
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
        performance_verified: moment.metadata?.performance_verified === true,
        reframe_plan: moment.metadata?.reframe_plan || null,
        original_source_range: moment.metadata?.original_source_range || null,
        selection_evidence: {
          signals: moment.metadata?.score_signals || {},
          requirement_match: moment.metadata?.best_requirement_match || null,
          transcript_segments: moment.metadata?.transcript_segments || [],
          performance: moment.metadata?.performance_evidence || null,
        },
        transition_in: requirement?.transition_in || null,
        transition_out: requirement?.transition_out || null,
      });
      used.add(moment.id);
      sourceCounts.set(sourceId, (sourceCounts.get(sourceId) || 0) + 1);
      cursor += duration;
      return true;
    };

    for (let index = 0; index < requirementList.length; index += 1) {
      if (maximumClips !== null && selected.length >= maximumClips) break;
      if (maximumDuration !== null && cursor >= maximumDuration) break;
      let moment = choose({
        moments,
        used,
        minimumScore,
        requirement: index,
        sourceCounts,
        maximumPerSource,
      });
      if (!moment && allowFallback) {
        moment = choose({ moments, used, minimumScore, sourceCounts, maximumPerSource });
      }
      if (!moment) {
        missing.push({ requirement_index: index, reason: "MATCHING_MOMENT_NOT_FOUND" });
        continue;
      }
      append(moment, requirementList[index], index);
    }

    const targetDuration = minimumDuration !== null ? minimumDuration : maximumDuration;
    while (
      targetDuration !== null &&
      cursor < targetDuration &&
      (maximumClips === null || selected.length < maximumClips)
    ) {
      let moment = choose({ moments, used, minimumScore, sourceCounts, maximumPerSource });
      if (!moment && allowFallback && maximumPerSource !== null) {
        moment = choose({ moments, used, minimumScore, sourceCounts, maximumPerSource: null });
      }
      if (!moment || !append(moment)) break;
    }

    if (!requirementList.length && targetDuration === null) {
      while (maximumClips === null || selected.length < maximumClips) {
        const moment = choose({ moments, used, minimumScore, sourceCounts, maximumPerSource });
        if (!moment || !append(moment)) break;
      }
    }

    if (!selected.length) throw new Error("TIMELINE_HAS_NO_ELIGIBLE_CLIPS");
    if (minimumDuration !== null && cursor + 0.001 < minimumDuration) {
      throw validationError("TIMELINE_MINIMUM_DURATION_NOT_REACHED", {
        minimum_duration_seconds: minimumDuration,
        actual_duration_seconds: cursor,
        eligible_moment_count: moments.length,
        selected_moment_count: selected.length,
        performance_verified_only: verifiedOnly,
      });
    }

    const distinctSources = new Set(
      selected.map((entry) => String(
        entry.source_asset_node_id || entry.source_clip_node_id || entry.source_moment_node_id,
      )),
    ).size;
    if (minimumDistinctSources !== null && distinctSources < minimumDistinctSources) {
      throw validationError("TIMELINE_SOURCE_DIVERSITY_NOT_REACHED", {
        minimum_distinct_sources: minimumDistinctSources,
        actual_distinct_sources: distinctSources,
        selected_moment_count: selected.length,
      });
    }
    if (verifiedOnly && selected.some((entry) => entry.performance_verified !== true)) {
      throw new Error("TIMELINE_CONTAINS_UNVERIFIED_PERFORMANCE_MOMENT");
    }

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
        distinct_source_count: distinctSources,
        performance_verified_only: verifiedOnly,
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
    const nodes = input.creative_project_id
      ? await AssetGraphRepository.listByProject(input)
      : [];
    const items = nodes.filter((node) => node.type === CREATIVE_ASSET_NODE_TYPES.TIMELINE);
    const current = items[0] || null;
    return {
      current,
      items,
      commands: ["compose", "build"],
      status: current?.status || "not_started",
      permissions,
    };
  },
};
