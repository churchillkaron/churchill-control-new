import crypto from "node:crypto";

import {
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => !["created_at", "updated_at", "resolved_at"].includes(key))
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function audioNode(node = {}) {
  return [
    CREATIVE_ASSET_NODE_TYPES.AUDIO,
    CREATIVE_ASSET_NODE_TYPES.MUSIC,
  ].includes(node.type) && Boolean(node.url);
}

function candidateScore(node = {}, expectedId = null) {
  let score = 0;
  if (expectedId && text(node.id) === text(expectedId)) score += 100000;
  if (node.metadata?.primary_soundtrack === true) score += 20000;
  if (node.metadata?.master_soundtrack === true) score += 15000;
  if (node.metadata?.render_role === "MASTER_SOUNDTRACK") score += 12000;
  if (node.type === CREATIVE_ASSET_NODE_TYPES.MUSIC) score += 1000;
  if (node.status === "APPROVED") score += 500;
  if (node.review?.approved === true) score += 500;
  if (node.review?.human_reviewed === true) score += 500;
  score += Math.min(600, finite(node.technical?.duration_seconds) || 0);
  return score;
}

export const CreativeMasterSoundtrackRuntime = {
  async resolve({
    organization_id,
    creative_project_id,
    timeline,
    project,
    nodes = null,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    const projectNodes = nodes || await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id,
    });
    const expectedId = text(
      timeline?.metadata?.primary_audio_asset_node_id ||
      timeline?.metadata?.primary_audio_asset_id ||
      project?.metadata?.primary_audio_asset_node_id ||
      project?.metadata?.primary_audio_asset_id ||
      project?.metadata?.performance_context?.primary_audio?.asset_node_id ||
      project?.metadata?.performance_context?.primary_audio?.asset_id ||
      project?.metadata?.master_plan?.production?.primary_audio_asset_node_id ||
      project?.metadata?.master_plan?.production?.primary_audio_asset_id,
    ) || null;

    const candidates = list(projectNodes)
      .filter(audioNode)
      .map((node) => ({ node, score: candidateScore(node, expectedId) }))
      .sort((left, right) => right.score - left.score);
    const selected = candidates[0]?.node || null;
    if (!selected) throw new Error("MASTER_SOUNDTRACK_ASSET_NODE_REQUIRED");
    if (expectedId && text(selected.id) !== expectedId) {
      throw new Error("MASTER_SOUNDTRACK_EXPLICIT_ASSET_NOT_FOUND");
    }
    if (
      selected.review?.approved !== true ||
      selected.review?.human_reviewed !== true ||
      selected.status !== "APPROVED"
    ) {
      throw new Error("MASTER_SOUNDTRACK_HUMAN_APPROVAL_REQUIRED");
    }

    const duration = finite(selected.technical?.duration_seconds);
    const timelineDuration = finite(timeline?.technical?.duration_seconds);
    if (!duration || !timelineDuration) {
      throw new Error("MASTER_SOUNDTRACK_AND_TIMELINE_DURATION_REQUIRED");
    }
    if (Math.abs(duration - timelineDuration) > 0.25) {
      throw new Error("MASTER_SOUNDTRACK_TIMELINE_DURATION_MISMATCH");
    }

    const contract = {
      contract: "MASTER_SOUNDTRACK_V1",
      creative_project_id,
      timeline_asset_node_id: timeline?.id || null,
      asset_node_id: selected.id,
      asset_checksum:
        selected.technical?.checksum ||
        selected.technical?.checksum_sha256 ||
        null,
      duration_seconds: duration,
      timeline_duration_seconds: timelineDuration,
      source_in_seconds: 0,
      timeline_in_seconds: 0,
      gain: 1,
      preserve_full_duration: true,
      preserve_level: true,
      allow_source_clip_audio: false,
      allow_provider_added_music: false,
      allow_additional_music_tracks: false,
      allow_automatic_fade: false,
      allow_automatic_normalization: false,
      allow_looping: false,
      allow_truncation: false,
      render_role: "MASTER_SOUNDTRACK",
    };
    return {
      ...contract,
      contract_hash: digest(contract),
      asset_node: selected,
    };
  },

  track(contract = {}) {
    if (contract.contract !== "MASTER_SOUNDTRACK_V1") {
      throw new Error("MASTER_SOUNDTRACK_CONTRACT_REQUIRED");
    }
    return {
      asset_node_id: contract.asset_node_id,
      timeline_in_seconds: 0,
      source_in_seconds: 0,
      duration_seconds: contract.duration_seconds,
      gain: 1,
      role: "MASTER_SOUNDTRACK",
      immutable: true,
      contract_hash: contract.contract_hash,
    };
  },

  hash: digest,
};
