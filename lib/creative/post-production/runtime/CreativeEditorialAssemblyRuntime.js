import crypto from "node:crypto";

import {
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

const CONTRACT = "AVANTIQO_EDITORIAL_ASSEMBLY_V1";
const BOUNDARY_CONTRACT = "AVANTIQO_EDITORIAL_TRANSITION_V1";
const SOURCE_GATE_CONTRACT = "AVANTIQO_EDITORIAL_SOURCE_GATE_V1";
const CONTINUITY_QC_CONTRACT = "AVANTIQO_CONTINUITY_QC_GATE_V1";
const CONTINUITY_QC_SEAL = "AVANTIQO_CONTINUITY_QC_SEAL_V1";
const DEFAULT_FRAME_RATE = 24;
const DEFAULT_TRANSITION_SECONDS = 0.3;
const MAX_TRANSITION_SECONDS = 1.5;
const MAX_TRANSITION_RATIO = 0.4;

const TYPES = Object.freeze({
  CUT: "CUT",
  MATCH_CUT: "MATCH_CUT",
  SMASH_CUT: "SMASH_CUT",
  CROSS_DISSOLVE: "CROSS_DISSOLVE",
  DIP_TO_BLACK: "DIP_TO_BLACK",
  J_CUT: "J_CUT",
  L_CUT: "L_CUT",
  AUDIO_CROSSFADE: "AUDIO_CROSSFADE",
});

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positive(value, fallback = null) {
  const number = finite(value, null);
  return number !== null && number > 0 ? number : fallback;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stable(value[key])]),
  );
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stable(value ?? null)))
    .digest("hex");
}

function unique(values = []) {
  return [...new Set(list(values).flat(Infinity).map((value) =>
    text(typeof value === "string" ? value : value?.code || value?.message || value, 1000),
  ).filter(Boolean))];
}

function transitionSource(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return text(
    value.type ||
    value.kind ||
    value.transition ||
    value.name ||
    value.style ||
    value.mode,
    600,
  );
}

function transitionType(value) {
  const source = transitionSource(value).toLowerCase();
  if (!source) return null;
  if (/\bj\s*[-_ ]?cut\b/.test(source)) return TYPES.J_CUT;
  if (/\bl\s*[-_ ]?cut\b/.test(source)) return TYPES.L_CUT;
  if (/audio[^a-z0-9]{0,8}(?:cross\s*fade|crossfade)|(?:cross\s*fade|crossfade)[^a-z0-9]{0,8}audio/.test(source)) {
    return TYPES.AUDIO_CROSSFADE;
  }
  if (/dip[^a-z0-9]{0,12}black|fade[^a-z0-9]{0,12}black|black[^a-z0-9]{0,12}fade/.test(source)) {
    return TYPES.DIP_TO_BLACK;
  }
  if (/cross\s*dissolve|crossdissolve|\bdissolve\b|cross\s*fade|crossfade/.test(source)) {
    return TYPES.CROSS_DISSOLVE;
  }
  if (/match\s*cut|matchcut/.test(source)) return TYPES.MATCH_CUT;
  if (/smash\s*cut|smashcut/.test(source)) return TYPES.SMASH_CUT;
  if (/hard\s*cut|straight\s*cut|\bcut\b/.test(source)) return TYPES.CUT;
  return "UNSUPPORTED";
}

function transitionReason(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return text(
      value.reason ||
      value.rationale ||
      value.motivation ||
      value.story_reason ||
      value.editorial_reason ||
      value.why,
      800,
    ) || null;
  }
  const source = text(value, 800);
  const separator = source.match(/[:—–-]\s*(.+)$/);
  return separator?.[1] ? text(separator[1], 800) : null;
}

function transitionDuration(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return positive(
    value.duration_seconds ??
    value.durationSeconds ??
    value.duration ??
    value.overlap_seconds ??
    value.overlapSeconds ??
    value.audio_overlap_seconds ??
    value.audioOverlapSeconds,
    null,
  );
}

function transitionMatchBasis(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return text(
    value.match_basis ||
    value.matchBasis ||
    value.visual_match ||
    value.visualMatch ||
    value.match ||
    value.bridge,
    800,
  ) || null;
}

function transitionAuthority(value, side) {
  const type = transitionType(value);
  if (!type) return null;
  return {
    side,
    type,
    raw: value,
    reason: transitionReason(value),
    duration_seconds: transitionDuration(value),
    match_basis: transitionMatchBasis(value),
  };
}

function requirementForEdit(timeline, edit) {
  const requirements = list(timeline.metadata?.requirements);
  const index = Number(edit.requirement_index);
  if (Number.isInteger(index) && requirements[index]) return requirements[index];
  const shotId = text(edit.shot_id, 500);
  if (shotId) {
    return requirements.find((requirement) =>
      text(requirement.shot_id, 500) === shotId,
    ) || {};
  }
  return {};
}

function sourceNodeForEdit(nodes, edit) {
  const ids = [
    edit.source_asset_node_id,
    edit.source_clip_node_id,
    edit.source_moment_node_id,
  ].map((value) => text(value, 500)).filter(Boolean);
  for (const id of ids) {
    const node = nodes.find((candidate) => text(candidate.id, 500) === id);
    if (!node) continue;
    if (node.type === CREATIVE_ASSET_NODE_TYPES.VIDEO) return node;
    const rootId = text(
      node.metadata?.source_asset_node_id ||
      node.parent_asset_node_id,
      500,
    );
    const root = nodes.find((candidate) =>
      text(candidate.id, 500) === rootId &&
      candidate.type === CREATIVE_ASSET_NODE_TYPES.VIDEO,
    );
    if (root) return root;
  }
  return null;
}

function productionTaskForNode(taskMap, node) {
  const id = text(
    node?.production_task_id || node?.metadata?.production_task_id,
    500,
  );
  return id ? taskMap.get(id) || null : null;
}

function generatedVideoTask(task = {}) {
  return text(task.capability || task.service_code || task.service_id, 500)
    .toLowerCase()
    .startsWith("ai.video.");
}

function sourceGate({ node, task, edit } = {}) {
  const blockers = [];
  if (!node) blockers.push("EDITORIAL_SOURCE_VIDEO_NOT_FOUND");
  if (node?.metadata?.include_in_master === false) {
    blockers.push("EDITORIAL_SOURCE_EXCLUDED_FROM_MASTER");
  }
  if (node?.metadata?.shot_candidate_review_passed === false) {
    blockers.push("EDITORIAL_SOURCE_CANDIDATE_REJECTED");
  }
  if (task && generatedVideoTask(task)) {
    if (text(task.status, 100).toUpperCase() !== "COMPLETED") {
      blockers.push("EDITORIAL_GENERATED_SOURCE_NOT_COMPLETED");
    }
    if (task.metadata?.approved_for_downstream_after_perceptual_review !== true) {
      blockers.push("EDITORIAL_GENERATED_SOURCE_NOT_PERCEPTUALLY_RELEASED");
    }
    if (
      task.metadata?.continuity_qc_contract !== CONTINUITY_QC_CONTRACT ||
      task.metadata?.continuity_qc_sealed !== true ||
      task.metadata?.continuity_qc_seal_contract !== CONTINUITY_QC_SEAL ||
      !text(task.metadata?.continuity_qc_seal_hash, 300)
    ) {
      blockers.push("EDITORIAL_GENERATED_SOURCE_CONTINUITY_QC_SEAL_REQUIRED");
    }
  }
  const result = {
    contract: SOURCE_GATE_CONTRACT,
    edit_index: edit.index || null,
    source_asset_node_id: node?.id || null,
    production_task_id: task?.id || null,
    generated_source: Boolean(task && generatedVideoTask(task)),
    passed: blockers.length === 0,
    blockers,
  };
  return {
    ...result,
    evidence_hash: hash(result),
  };
}

function boundedDuration({ requested, fromDuration, toDuration, frameRate }) {
  const fps = positive(frameRate, DEFAULT_FRAME_RATE);
  const minimum = 2 / fps;
  const shorter = Math.min(fromDuration, toDuration);
  const maximum = Math.min(
    MAX_TRANSITION_SECONDS,
    Math.max(0, shorter * MAX_TRANSITION_RATIO),
  );
  const desired = positive(requested, DEFAULT_TRANSITION_SECONDS);
  if (maximum < minimum) return null;
  const clamped = Math.max(minimum, Math.min(desired, maximum));
  return Number((Math.round(clamped * fps) / fps).toFixed(6));
}

function inferMotivation({ type, fromRequirement, toRequirement, explicitReason, matchBasis }) {
  if (explicitReason) return explicitReason;
  if (matchBasis) return `Declared match basis: ${matchBasis}`;
  if (text(fromRequirement.scene_id, 500) !== text(toRequirement.scene_id, 500)) {
    return "Explicit transition bridges a scene boundary.";
  }
  if ([TYPES.J_CUT, TYPES.L_CUT, TYPES.AUDIO_CROSSFADE].includes(type)) {
    const hasAudioStory = Boolean(
      list(fromRequirement.dialogue).length ||
      list(toRequirement.dialogue).length ||
      text(fromRequirement.narration) ||
      text(toRequirement.narration),
    );
    if (hasAudioStory) return "Explicit split edit preserves narrative audio flow.";
  }
  if ([TYPES.MATCH_CUT, TYPES.SMASH_CUT].includes(type)) {
    return "Explicit editorial cut declared by approved shot direction.";
  }
  return null;
}

function resolvedBoundary({
  fromRequirement,
  toRequirement,
  fromEdit,
  toEdit,
  frameRate,
} = {}) {
  const outgoing = transitionAuthority(fromRequirement.transition_out, "OUT");
  const incoming = transitionAuthority(toRequirement.transition_in, "IN");
  const blockers = [];

  if (outgoing?.type === "UNSUPPORTED") blockers.push("EDITORIAL_TRANSITION_OUT_UNSUPPORTED");
  if (incoming?.type === "UNSUPPORTED") blockers.push("EDITORIAL_TRANSITION_IN_UNSUPPORTED");
  if (
    outgoing && incoming &&
    outgoing.type !== "UNSUPPORTED" &&
    incoming.type !== "UNSUPPORTED" &&
    outgoing.type !== incoming.type
  ) {
    blockers.push("EDITORIAL_TRANSITION_AUTHORITY_CONFLICT");
  }

  const authority =
    (outgoing && outgoing.type !== "UNSUPPORTED" ? outgoing : null) ||
    (incoming && incoming.type !== "UNSUPPORTED" ? incoming : null);
  const type = authority?.type || TYPES.CUT;
  const explicit = Boolean(authority);
  const fromDuration = positive(fromEdit.duration_seconds, 0);
  const toDuration = positive(toEdit.duration_seconds, 0);
  let duration = 0;
  let visualMode = "CUT";
  let ffmpegTransition = null;
  let visualOverlap = 0;
  let audioMode = "CUT";
  let audioOverlap = 0;

  if ([TYPES.CROSS_DISSOLVE, TYPES.DIP_TO_BLACK].includes(type)) {
    duration = boundedDuration({
      requested: authority?.duration_seconds,
      fromDuration,
      toDuration,
      frameRate,
    });
    if (!duration) blockers.push("EDITORIAL_TRANSITION_CLIPS_TOO_SHORT");
    else {
      visualMode = "XFADE";
      ffmpegTransition = type === TYPES.DIP_TO_BLACK ? "fadeblack" : "fade";
      visualOverlap = duration;
      audioMode = type === TYPES.CROSS_DISSOLVE ? "CROSSFADE" : "CUT";
      audioOverlap = type === TYPES.CROSS_DISSOLVE ? duration : 0;
    }
  } else if ([TYPES.J_CUT, TYPES.L_CUT, TYPES.AUDIO_CROSSFADE].includes(type)) {
    duration = boundedDuration({
      requested: authority?.duration_seconds,
      fromDuration,
      toDuration,
      frameRate,
    });
    if (!duration) blockers.push("EDITORIAL_SPLIT_EDIT_CLIPS_TOO_SHORT");
    else {
      audioMode = type;
      audioOverlap = duration;
    }
  }

  const reason = inferMotivation({
    type,
    fromRequirement,
    toRequirement,
    explicitReason: authority?.reason,
    matchBasis: authority?.match_basis,
  });
  if (explicit && type !== TYPES.CUT && !reason) {
    blockers.push("EDITORIAL_TRANSITION_MOTIVATION_REQUIRED");
  }

  const base = {
    contract: BOUNDARY_CONTRACT,
    boundary_index: Number(fromEdit.index || 1),
    from_edit_index: Number(fromEdit.index || 1),
    to_edit_index: Number(toEdit.index || 2),
    from_shot_id: fromRequirement.shot_id || null,
    to_shot_id: toRequirement.shot_id || null,
    from_scene_id: fromRequirement.scene_id || null,
    to_scene_id: toRequirement.scene_id || null,
    type,
    explicit_authority: explicit,
    authority_side: authority?.side || "DEFAULT",
    motivation: reason,
    match_basis: authority?.match_basis || null,
    duration_seconds: duration,
    visual_mode: visualMode,
    ffmpeg_transition: ffmpegTransition,
    visual_overlap_seconds: visualOverlap,
    audio_mode: audioMode,
    audio_overlap_seconds: audioOverlap,
    blockers,
    passed: blockers.length === 0,
    policy: {
      hard_cut_is_default: true,
      decorative_transition_invention_forbidden: true,
      generative_morph_transition_forbidden: true,
      transition_duration_bounded_by_clip_length: true,
      split_edits_require_real_source_audio_handles: true,
    },
  };
  return {
    ...base,
    boundary_hash: hash(base),
  };
}

function sourceDuration(node) {
  return positive(
    node?.technical?.duration_seconds ??
    node?.metadata?.duration_seconds,
    null,
  );
}

function validateAudioHandles({ boundary, fromEntry, toEntry, fromNode, toNode } = {}) {
  const blockers = [];
  const duration = positive(boundary.audio_overlap_seconds, 0);
  if (!duration) return blockers;

  if (boundary.audio_mode === TYPES.J_CUT) {
    if (positive(toEntry.source_in_seconds, 0) + 1e-6 < duration) {
      blockers.push("EDITORIAL_J_CUT_PREROLL_HANDLE_REQUIRED");
    }
  }
  if (boundary.audio_mode === TYPES.L_CUT) {
    const mediaDuration = sourceDuration(fromNode);
    if (mediaDuration === null) {
      blockers.push("EDITORIAL_L_CUT_SOURCE_DURATION_REQUIRED");
    } else if (mediaDuration + 1e-6 < Number(fromEntry.source_out_seconds) + duration) {
      blockers.push("EDITORIAL_L_CUT_TAIL_HANDLE_REQUIRED");
    }
  }
  if (boundary.audio_mode === TYPES.AUDIO_CROSSFADE) {
    const half = duration / 2;
    if (positive(toEntry.source_in_seconds, 0) + 1e-6 < half) {
      blockers.push("EDITORIAL_AUDIO_CROSSFADE_PREROLL_HANDLE_REQUIRED");
    }
    const mediaDuration = sourceDuration(fromNode);
    if (mediaDuration === null) {
      blockers.push("EDITORIAL_AUDIO_CROSSFADE_SOURCE_DURATION_REQUIRED");
    } else if (mediaDuration + 1e-6 < Number(fromEntry.source_out_seconds) + half) {
      blockers.push("EDITORIAL_AUDIO_CROSSFADE_TAIL_HANDLE_REQUIRED");
    }
  }
  return blockers;
}

function applyAssemblyTiming(edits, boundaries, sourceNodes) {
  const entries = edits.map((edit) => ({
    ...edit,
    assembly_timeline_in_seconds: 0,
    assembly_timeline_out_seconds: 0,
    source_audio: {
      source_in_seconds: Number(edit.source_in_seconds),
      source_out_seconds: Number(edit.source_out_seconds),
      timeline_in_seconds: 0,
      timeline_out_seconds: 0,
      fade_in_seconds: 0,
      fade_out_seconds: 0,
    },
  }));
  let cursor = 0;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const duration = Number(entry.source_out_seconds) - Number(entry.source_in_seconds);
    const overlap = index > 0
      ? positive(boundaries[index - 1]?.visual_overlap_seconds, 0)
      : 0;
    const start = Math.max(0, cursor - overlap);
    const end = start + duration;
    entry.assembly_timeline_in_seconds = Number(start.toFixed(6));
    entry.assembly_timeline_out_seconds = Number(end.toFixed(6));
    entry.source_audio.timeline_in_seconds = entry.assembly_timeline_in_seconds;
    entry.source_audio.timeline_out_seconds = entry.assembly_timeline_out_seconds;
    cursor = end;
  }

  for (let index = 0; index < boundaries.length; index += 1) {
    const boundary = boundaries[index];
    const previous = entries[index];
    const next = entries[index + 1];
    const fromNode = sourceNodes[index];
    const toNode = sourceNodes[index + 1];
    const handleBlockers = validateAudioHandles({
      boundary,
      fromEntry: previous,
      toEntry: next,
      fromNode,
      toNode,
    });
    boundary.blockers = unique([boundary.blockers, handleBlockers]);
    boundary.passed = boundary.blockers.length === 0;

    const duration = positive(boundary.audio_overlap_seconds, 0);
    if (!duration) continue;
    if (boundary.audio_mode === "CROSSFADE") {
      previous.source_audio.fade_out_seconds = duration;
      next.source_audio.fade_in_seconds = duration;
    } else if (boundary.audio_mode === TYPES.J_CUT) {
      next.source_audio.source_in_seconds = Number(
        (Number(next.source_in_seconds) - duration).toFixed(6),
      );
      next.source_audio.timeline_in_seconds = Number(
        (next.assembly_timeline_in_seconds - duration).toFixed(6),
      );
    } else if (boundary.audio_mode === TYPES.L_CUT) {
      previous.source_audio.source_out_seconds = Number(
        (Number(previous.source_out_seconds) + duration).toFixed(6),
      );
      previous.source_audio.timeline_out_seconds = Number(
        (previous.assembly_timeline_out_seconds + duration).toFixed(6),
      );
    } else if (boundary.audio_mode === TYPES.AUDIO_CROSSFADE) {
      const half = duration / 2;
      previous.source_audio.source_out_seconds = Number(
        (Number(previous.source_out_seconds) + half).toFixed(6),
      );
      previous.source_audio.timeline_out_seconds = Number(
        (previous.assembly_timeline_out_seconds + half).toFixed(6),
      );
      previous.source_audio.fade_out_seconds = duration;
      next.source_audio.source_in_seconds = Number(
        (Number(next.source_in_seconds) - half).toFixed(6),
      );
      next.source_audio.timeline_in_seconds = Number(
        (next.assembly_timeline_in_seconds - half).toFixed(6),
      );
      next.source_audio.fade_in_seconds = duration;
    }
  }
  return {
    entries,
    output_duration_seconds: entries.length
      ? Number(entries.at(-1).assembly_timeline_out_seconds.toFixed(6))
      : 0,
  };
}

function transitionCounts(boundaries) {
  const counts = {};
  for (const boundary of boundaries) {
    counts[boundary.type] = (counts[boundary.type] || 0) + 1;
  }
  return counts;
}

function timeMap(boundaries) {
  let cumulative = 0;
  return boundaries.map((boundary) => {
    cumulative += positive(boundary.visual_overlap_seconds, 0);
    return {
      boundary_index: boundary.boundary_index,
      original_cut_seconds: boundary.original_cut_seconds,
      assembly_transition_start_seconds: boundary.assembly_transition_start_seconds,
      visual_overlap_seconds: boundary.visual_overlap_seconds,
      cumulative_visual_overlap_seconds: Number(cumulative.toFixed(6)),
    };
  });
}

function mapTimelineTime(plan, value) {
  let mapped = Math.max(0, finite(value, 0));
  for (const boundary of list(plan?.time_map)) {
    if (mapped + finite(boundary.cumulative_visual_overlap_seconds, 0) >= finite(boundary.original_cut_seconds, Infinity)) {
      mapped = Math.max(
        0,
        finite(value, 0) - finite(boundary.cumulative_visual_overlap_seconds, 0),
      );
    }
  }
  return Number(mapped.toFixed(6));
}

async function plan({ organization_id, creative_project_id, timeline_asset_node_id } = {}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");
  if (!timeline_asset_node_id) throw new Error("timeline_asset_node_id required");

  const [timeline, nodes, tasks] = await Promise.all([
    AssetGraphRepository.getById(timeline_asset_node_id),
    AssetGraphRepository.listByProject({ organization_id, creative_project_id }),
    ProductionTaskRuntime.list({ organization_id, creative_project_id }),
  ]);
  if (
    !timeline ||
    text(timeline.organization_id, 500) !== text(organization_id, 500) ||
    text(timeline.creative_project_id, 500) !== text(creative_project_id, 500) ||
    timeline.type !== CREATIVE_ASSET_NODE_TYPES.TIMELINE
  ) {
    throw new Error("EDITORIAL_ASSEMBLY_TIMELINE_NOT_FOUND");
  }

  const edits = list(timeline.metadata?.edit_decision_list);
  if (!edits.length) throw new Error("EDITORIAL_ASSEMBLY_EDL_REQUIRED");
  const frameRate = positive(
    timeline.metadata?.composition_options?.frame_rate ??
    timeline.metadata?.composition_options?.frameRate,
    DEFAULT_FRAME_RATE,
  );
  const taskMap = new Map(tasks.map((task) => [text(task.id, 500), task]));
  const sourceNodes = edits.map((edit) => sourceNodeForEdit(nodes, edit));
  const sourceGates = edits.map((edit, index) => {
    const node = sourceNodes[index];
    return sourceGate({
      node,
      task: productionTaskForNode(taskMap, node),
      edit,
    });
  });

  const boundaries = [];
  for (let index = 0; index < edits.length - 1; index += 1) {
    const fromEdit = edits[index];
    const toEdit = edits[index + 1];
    const fromRequirement = requirementForEdit(timeline, fromEdit);
    const toRequirement = requirementForEdit(timeline, toEdit);
    const boundary = resolvedBoundary({
      fromRequirement,
      toRequirement,
      fromEdit,
      toEdit,
      frameRate,
    });
    boundary.original_cut_seconds = finite(
      fromEdit.timeline_out_seconds,
      edits.slice(0, index + 1).reduce(
        (total, edit) => total + positive(edit.duration_seconds, 0),
        0,
      ),
    );
    boundaries.push(boundary);
  }

  const timed = applyAssemblyTiming(edits, boundaries, sourceNodes);
  for (let index = 0; index < boundaries.length; index += 1) {
    boundaries[index].assembly_transition_start_seconds = Number(
      timed.entries[index + 1].assembly_timeline_in_seconds.toFixed(6),
    );
    boundaries[index].boundary_hash = hash({
      ...boundaries[index],
      boundary_hash: undefined,
    });
  }

  const blockers = unique([
    sourceGates.filter((gate) => !gate.passed).flatMap((gate) => gate.blockers),
    boundaries.filter((boundary) => !boundary.passed).flatMap((boundary) => boundary.blockers),
  ]);
  const counts = transitionCounts(boundaries);
  const assemblyBase = {
    contract: CONTRACT,
    version: 1,
    timeline_asset_node_id: timeline.id,
    timeline_identity: timeline.metadata?.timeline_identity || null,
    organization_id,
    creative_project_id,
    frame_rate_basis: frameRate,
    source_gate_contract: SOURCE_GATE_CONTRACT,
    source_gates: sourceGates,
    boundary_contract: BOUNDARY_CONTRACT,
    entries: timed.entries,
    boundaries,
    transition_counts: counts,
    input_duration_seconds: finite(
      timeline.metadata?.total_duration_seconds ?? timeline.technical?.duration_seconds,
      edits.reduce((sum, edit) => sum + positive(edit.duration_seconds, 0), 0),
    ),
    output_duration_seconds: timed.output_duration_seconds,
    total_visual_overlap_seconds: Number(
      boundaries.reduce(
        (sum, boundary) => sum + positive(boundary.visual_overlap_seconds, 0),
        0,
      ).toFixed(6),
    ),
    time_map: timeMap(boundaries),
    transition_render_required: boundaries.some((boundary) =>
      boundary.visual_mode === "XFADE" ||
      [TYPES.J_CUT, TYPES.L_CUT, TYPES.AUDIO_CROSSFADE].includes(boundary.audio_mode),
    ),
    passed: blockers.length === 0,
    status: blockers.length ? "BLOCKED" : "READY",
    blockers,
    policy: {
      cut_is_default: true,
      transition_requires_approved_direction: true,
      no_automatic_decorative_transitions: true,
      no_generative_morphs: true,
      source_candidate_must_be_released: true,
      generated_source_continuity_qc_seal_required: true,
      transition_duration_frame_bounded: true,
      source_audio_split_edits_use_real_media_handles: true,
      timeline_order_and_trim_points_preserved: true,
    },
  };
  return {
    ...assemblyBase,
    assembly_hash: hash(assemblyBase),
  };
}

export const CreativeEditorialAssemblyRuntime = Object.freeze({
  contract: CONTRACT,
  boundaryContract: BOUNDARY_CONTRACT,
  sourceGateContract: SOURCE_GATE_CONTRACT,
  types: TYPES,
  plan,
  mapTimelineTime,
  transitionType,
});
