import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  creativeStorageUri,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  CreativeEdlRenderRuntime,
} from "@/lib/creative/post-production/runtime/CreativeEdlRenderRuntime";

const CONTRACT = "CREATIVE_APPROVED_DIRECTION_EXACT_RESUME_V2";
const LEGACY_CONTRACT = "CREATIVE_APPROVED_DIRECTION_EXACT_RESUME_V1";
const TABLE = "creative_projects";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value) {
  return Number(Number(value).toFixed(6));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
  );
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function sourceNodeType(role) {
  const value = text(role).toLowerCase();
  if (value === "narration") return CREATIVE_ASSET_NODE_TYPES.VOICE;
  if (value === "score") return CREATIVE_ASSET_NODE_TYPES.MUSIC;
  return CREATIVE_ASSET_NODE_TYPES.VIDEO;
}

function approvedSourceRoles(config = {}) {
  const explicit = new Set(
    list(config.approved_source_roles).map((role) => text(role)),
  );

  for (const role of Object.keys(object(config.sources))) {
    const normalized = text(role);
    if (
      normalized === "narration" ||
      normalized === "score" ||
      normalized === "logo_3d" ||
      normalized.startsWith("founder_")
    ) {
      explicit.add(normalized);
    }
  }

  return explicit;
}

async function project(projectId, organizationId) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("id", projectId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("CREATIVE_PROJECT_NOT_FOUND");
  return data;
}

function configFromProject(projectRecord) {
  const config = object(projectRecord.metadata?.approved_direction_resume);
  if (![CONTRACT, LEGACY_CONTRACT].includes(config.contract)) {
    throw new Error("APPROVED_DIRECTION_RESUME_CONTRACT_REQUIRED");
  }
  if (projectRecord.metadata?.studio_source_of_truth !== true) {
    throw new Error("STUDIO_SOURCE_OF_TRUTH_REQUIRED");
  }
  if (projectRecord.metadata?.timeline_loaded !== true) {
    throw new Error("LOCKED_TIMELINE_REQUIRED");
  }
  return config;
}

function validateConfig(config, projectRecord) {
  const sources = object(config.sources);
  const edits = list(config.edit_decision_list);
  const audio = list(config.audio_tracks);
  const bucket = text(config.source_bucket);
  const target = finite(
    config.locked_duration_seconds,
    finite(projectRecord.target_duration),
  );
  if (!bucket) throw new Error("APPROVED_DIRECTION_SOURCE_BUCKET_REQUIRED");
  if (!target || target <= 0) {
    throw new Error("APPROVED_DIRECTION_DURATION_REQUIRED");
  }
  if (!edits.length) throw new Error("APPROVED_DIRECTION_EDL_REQUIRED");

  let cursor = 0;
  const missingRoles = new Set();
  for (const [index, edit] of edits.entries()) {
    const role = text(edit.source_role);
    const sourcePath = text(sources[role]);
    const sourceIn = finite(edit.source_in_seconds);
    const sourceOut = finite(edit.source_out_seconds);
    const timelineIn = finite(edit.timeline_in_seconds);
    const timelineOut = finite(edit.timeline_out_seconds);
    if (!role || !sourcePath) missingRoles.add(role || `edit:${index}`);
    if (
      sourceIn === null || sourceOut === null || sourceOut <= sourceIn ||
      timelineIn === null || timelineOut === null || timelineOut <= timelineIn
    ) {
      throw new Error(`APPROVED_DIRECTION_EDIT_INVALID:${index}`);
    }
    if (Math.abs(timelineIn - cursor) > 0.002) {
      throw new Error(`APPROVED_DIRECTION_TIMELINE_GAP:${index}:${cursor}:${timelineIn}`);
    }
    const sourceDuration = round(sourceOut - sourceIn);
    const timelineDuration = round(timelineOut - timelineIn);
    if (Math.abs(sourceDuration - timelineDuration) > 0.002) {
      throw new Error(`APPROVED_DIRECTION_EDIT_DURATION_MISMATCH:${index}`);
    }
    cursor = timelineOut;
  }
  if (missingRoles.size) {
    throw new Error(
      `APPROVED_DIRECTION_SOURCE_ROLES_MISSING:${[...missingRoles].join(",")}`,
    );
  }
  if (Math.abs(cursor - target) > 0.002) {
    throw new Error(`APPROVED_DIRECTION_DURATION_MISMATCH:${cursor}:${target}`);
  }

  for (const [index, track] of audio.entries()) {
    const role = text(track.source_role);
    if (!role || !text(sources[role])) {
      throw new Error(`APPROVED_DIRECTION_AUDIO_SOURCE_MISSING:${index}:${role}`);
    }
  }

  return {
    sources,
    edits,
    audio,
    bucket,
    target,
    approvedRoles: approvedSourceRoles(config),
    identity: hash({
      contract: CONTRACT,
      project_id: projectRecord.id,
      canonical_master_contract:
        projectRecord.metadata?.canonical_master_contract || null,
      timeline_contract: projectRecord.metadata?.timeline_contract || null,
      sources,
      edits,
      audio,
      target,
    }),
  };
}

async function ensureSourceNode({
  organizationId,
  projectId,
  bucket,
  role,
  storagePath,
  approved,
}) {
  const identity = hash({ projectId, role, bucket, storagePath });
  const url = creativeStorageUri(bucket, storagePath);
  const type = sourceNodeType(role);
  const isApproved = approved === true;
  const result = await AssetGraphRepository.createOrFindByMetadataIdentity({
    metadata_key: "approved_resume_source_identity",
    metadata_value: identity,
    node: createCreativeAssetNode({
      organization_id: organizationId,
      creative_project_id: projectId,
      type,
      status: isApproved
        ? CREATIVE_ASSET_NODE_STATUS.APPROVED
        : CREATIVE_ASSET_NODE_STATUS.REVIEW,
      name: isApproved
        ? `Approved direction source — ${role}`
        : `Exact-resume review source — ${role}`,
      description: isApproved
        ? "Locked source material with explicit approval evidence for exact resume."
        : "Recovered or bound exact-resume source material awaiting review evidence.",
      url,
      storage_path: storagePath,
      lineage: {
        source: "approved_direction_exact_resume",
        capability: "creative.approved-direction.resume",
        generation_version: 2,
      },
      technical: {
        mime_type:
          type === CREATIVE_ASSET_NODE_TYPES.VIDEO
            ? "video/mp4"
            : "audio/mpeg",
      },
      reuse: {
        reusable: isApproved,
        approved_for_reuse: isApproved,
      },
      review: {
        ai_reviewed: false,
        human_reviewed: isApproved,
        approved: isApproved,
        notes: isApproved
          ? "Explicitly approved source role from locked Studio direction."
          : "No human approval is inferred from source binding or recovery.",
      },
      metadata: {
        approved_resume_source_identity: identity,
        approved_resume_source_role: role,
        approved_direction_resume_contract: CONTRACT,
        selected_for_exact_resume: true,
        explicit_source_approval: isApproved,
      },
    }),
  });
  return result.node;
}

function proofEdits(edits, limitSeconds) {
  const limit = finite(limitSeconds);
  if (!limit) return edits;
  const output = [];
  for (const edit of edits) {
    if (edit.timeline_in_seconds >= limit) break;
    const end = Math.min(edit.timeline_out_seconds, limit);
    const duration = round(end - edit.timeline_in_seconds);
    if (duration <= 0) continue;
    output.push({
      ...edit,
      timeline_out_seconds: round(edit.timeline_in_seconds + duration),
      source_out_seconds: round(edit.source_in_seconds + duration),
      duration_seconds: duration,
    });
  }
  return output;
}

function proofAudio(tracks, limitSeconds) {
  const limit = finite(limitSeconds);
  if (!limit) return tracks;
  return tracks
    .map((track) => {
      const timelineIn = finite(track.timeline_in_seconds, 0);
      if (timelineIn >= limit) return null;
      const available = limit - timelineIn;
      const configured = finite(track.duration_seconds, available);
      return {
        ...track,
        duration_seconds: round(Math.min(configured, available)),
      };
    })
    .filter(Boolean);
}

async function ensureTimeline({
  organizationId,
  projectId,
  identity,
  edits,
  sourceNodes,
  duration,
  mode,
}) {
  const timelineIdentity = hash({ identity, mode, edits, duration });
  const nodeEdits = edits.map((edit, index) => {
    const source = sourceNodes.get(edit.source_role);
    if (!source) {
      throw new Error(`APPROVED_DIRECTION_SOURCE_NODE_MISSING:${edit.source_role}`);
    }
    return {
      index: index + 1,
      source_asset_node_id: source.id,
      source_url: source.url,
      source_in_seconds: Number(edit.source_in_seconds),
      source_out_seconds: Number(edit.source_out_seconds),
      timeline_in_seconds: Number(edit.timeline_in_seconds),
      timeline_out_seconds: Number(edit.timeline_out_seconds),
      duration_seconds: Number(edit.duration_seconds),
      editorial_label: edit.label || edit.source_role,
      approved_direction_source_role: edit.source_role,
      performance_verified:
        text(edit.source_role).startsWith("founder_") ||
        edit.source_role === "logo_3d",
    };
  });

  const result = await AssetGraphRepository.createOrFindByMetadataIdentity({
    metadata_key: "approved_resume_timeline_identity",
    metadata_value: timelineIdentity,
    node: createCreativeAssetNode({
      organization_id: organizationId,
      creative_project_id: projectId,
      type: CREATIVE_ASSET_NODE_TYPES.TIMELINE,
      status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
      name: mode === "PROOF"
        ? "Approved Direction — 40s Studio Proof"
        : "Approved Direction — Full Studio Master",
      description:
        "Deterministic exact-resume EDL. Creative direction is locked and not re-generated; release approval remains separate.",
      lineage: {
        source: "approved_direction_exact_resume",
        capability: "creative.timeline.exact-resume",
        generation_version: 2,
      },
      technical: {
        mime_type: "application/vnd.avantiqo.edl+json",
        duration_seconds: duration,
      },
      reuse: { reusable: false, approved_for_reuse: false },
      review: {
        ai_reviewed: true,
        human_reviewed: false,
        approved: false,
        notes: "Locked direction preserved. New workprint requires real release review; human approval is never inferred.",
      },
      metadata: {
        format: "AVANTIQO_EDL_V1",
        timeline_identity: timelineIdentity,
        approved_resume_timeline_identity: timelineIdentity,
        approved_direction_resume_identity: identity,
        approved_direction_resume_contract: CONTRACT,
        exact_timeline: true,
        direction_reexecuted: false,
        shot_plan_rebuilt: false,
        edit_decision_list: nodeEdits,
        total_duration_seconds: duration,
        clip_count: nodeEdits.length,
        mode,
        release_approval_required: true,
      },
    }),
  });
  return result.node;
}

async function updateProjectResult(projectRecord, mode, values) {
  const current = object(projectRecord.metadata);
  const previous = object(current.approved_direction_resume_result);
  const next = {
    ...previous,
    [mode.toLowerCase()]: {
      ...(object(previous[mode.toLowerCase()])),
      ...values,
      updated_at: new Date().toISOString(),
    },
  };
  const { error } = await supabaseAdmin
    .from(TABLE)
    .update({
      metadata: {
        ...current,
        approved_direction_resume_result: next,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectRecord.id)
    .eq("organization_id", projectRecord.organization_id);
  if (error) throw error;
}

export const CreativeApprovedDirectionResumeRuntime = Object.freeze({
  contract: CONTRACT,

  async inspect({ organization_id, creative_project_id } = {}) {
    if (!organization_id || !creative_project_id) {
      throw new Error("APPROVED_DIRECTION_RESUME_SCOPE_REQUIRED");
    }
    const projectRecord = await project(creative_project_id, organization_id);
    const config = configFromProject(projectRecord);
    const validated = validateConfig(config, projectRecord);
    return {
      contract: CONTRACT,
      organization_id,
      creative_project_id,
      direction_reexecuted: false,
      shot_plan_rebuilt: false,
      source_count: Object.keys(validated.sources).length,
      approved_source_count: validated.approvedRoles.size,
      edit_count: validated.edits.length,
      locked_duration_seconds: validated.target,
      identity: validated.identity,
      proof_duration_seconds: finite(config.proof?.duration_seconds, 40),
    };
  },

  async render({
    organization_id,
    creative_project_id,
    mode = "FULL",
    force = false,
  } = {}) {
    const requestedMode = text(mode).toUpperCase() === "PROOF" ? "PROOF" : "FULL";
    const projectRecord = await project(creative_project_id, organization_id);
    const config = configFromProject(projectRecord);
    const validated = validateConfig(config, projectRecord);

    const sourceNodes = new Map();
    for (const [role, storagePath] of Object.entries(validated.sources)) {
      sourceNodes.set(
        role,
        await ensureSourceNode({
          organizationId: organization_id,
          projectId: creative_project_id,
          bucket: validated.bucket,
          role,
          storagePath,
          approved: validated.approvedRoles.has(role),
        }),
      );
    }

    const proofDuration = finite(config.proof?.duration_seconds, 40);
    const duration = requestedMode === "PROOF"
      ? Math.min(validated.target, proofDuration)
      : validated.target;
    const edits = requestedMode === "PROOF"
      ? proofEdits(validated.edits, duration)
      : validated.edits;
    const audioConfig = requestedMode === "PROOF"
      ? proofAudio(validated.audio, duration)
      : validated.audio;

    const timeline = await ensureTimeline({
      organizationId: organization_id,
      projectId: creative_project_id,
      identity: validated.identity,
      edits,
      sourceNodes,
      duration,
      mode: requestedMode,
    });

    const tracks = {
      audio: audioConfig.map((track) => {
        const node = sourceNodes.get(track.source_role);
        if (!node) {
          throw new Error(`APPROVED_DIRECTION_AUDIO_NODE_MISSING:${track.source_role}`);
        }
        return {
          asset_node_id: node.id,
          role: track.role || track.source_role,
          timeline_in_seconds: finite(track.timeline_in_seconds, 0),
          source_in_seconds: finite(track.source_in_seconds, 0),
          duration_seconds: finite(track.duration_seconds),
          gain: finite(track.gain, 1),
        };
      }),
      overlays: [],
      subtitle_asset_node_id: null,
    };

    const exportProfile = {
      ...object(config.export_profile),
      id: requestedMode === "PROOF"
        ? `${text(config.export_profile?.id || "approved-direction")}-proof`
        : text(config.export_profile?.id || "approved-direction-master"),
      name: requestedMode === "PROOF"
        ? "Approved Direction Studio Proof"
        : text(config.export_profile?.name || "Approved Direction Studio Master"),
      include_source_audio: false,
    };

    const result = await CreativeEdlRenderRuntime.render({
      organization_id,
      timeline_asset_node_id: timeline.id,
      export_profile: exportProfile,
      tracks,
      force,
      policy: {
        render_bucket: validated.bucket,
        render_timeout_ms: requestedMode === "PROOF" ? 240000 : 900000,
      },
    });

    const render = result.render;
    await updateProjectResult(projectRecord, requestedMode, {
      timeline_asset_node_id: timeline.id,
      render_asset_node_id: render?.id || null,
      render_url: render?.url || null,
      storage_path: render?.storage_path || null,
      duration_seconds:
        render?.technical?.duration_seconds ||
        render?.metadata?.duration_seconds ||
        duration,
      checksum:
        render?.technical?.checksum ||
        render?.metadata?.checksum ||
        null,
      exact_resume_identity: validated.identity,
      direction_reexecuted: false,
      shot_plan_rebuilt: false,
      reused: result.reused === true,
      release_approval_required: true,
    });

    return {
      contract: CONTRACT,
      mode: requestedMode,
      direction_reexecuted: false,
      shot_plan_rebuilt: false,
      exact_resume_identity: validated.identity,
      timeline,
      render,
      reused: result.reused === true,
      release_approval_required: true,
    };
  },
});