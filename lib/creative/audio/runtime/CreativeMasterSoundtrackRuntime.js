import crypto from "node:crypto";

import {
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import * as ProductionTaskRepository
from "@/lib/operations/tasks/repositories/ProductionTaskRepository";
import { unwrapAudioOutput } from "@/lib/creative/audio/runtime/AudioFinishingContractRuntime";

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

function canonicalAudioProof(asset = {}, tasks = []) {
  const checksum = text(asset.technical?.checksum || asset.technical?.checksum_sha256);
  const url = text(asset.url);
  const candidates = list(tasks)
    .filter((task) => task.status === "COMPLETED")
    .map((task) => ({ task, output: unwrapAudioOutput(task.output) }))
    .filter(({ task, output }) =>
      Boolean(output?.master_url) &&
      (
        text(output.master_url) === url ||
        (checksum && text(output.checksum) === checksum)
      ) &&
      (
        text(task.capability) === "creative.audio.finish" ||
        text(task.service_code) === "creative.audio.finish" ||
        text(task.metadata?.production_step_id).toLowerCase() === "finish"
      ),
    );

  const matched = candidates.find(({ output }) =>
    output.master_report?.qc?.passed === true &&
    output.audio_master_qc_sealed === true &&
    /^[a-f0-9]{64}$/i.test(text(output.audio_master_qc_seal_hash)),
  ) || null;

  return matched ? {
    task_id: matched.task.id,
    master_id: matched.output.master_id || null,
    master_checksum: matched.output.checksum || checksum || null,
    qc_seal_hash: text(matched.output.audio_master_qc_seal_hash),
    master_report_contract: matched.output.master_report?.contract || null,
    master_report_qc_contract: matched.output.master_report?.qc?.contract || null,
    passed: true,
  } : null;
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
    const [projectNodes, projectTasks] = await Promise.all([
      nodes || AssetGraphRepository.listByProject({
        organization_id,
        creative_project_id,
      }),
      ProductionTaskRepository.listByProject({
        organization_id,
        creative_project_id,
      }),
    ]);
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
    const audioStudioProof = canonicalAudioProof(selected, projectTasks);
    if (!audioStudioProof) {
      throw new Error("MASTER_SOUNDTRACK_AUDIO_STUDIO_QC_SEAL_REQUIRED");
    }
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
      audio_studio_qc_sealed: true,
      audio_studio_qc_seal_hash: audioStudioProof.qc_seal_hash,
      audio_studio_finish_task_id: audioStudioProof.task_id,
      audio_studio_master_id: audioStudioProof.master_id,
      audio_studio_master_checksum: audioStudioProof.master_checksum,
      audio_studio_master_report_contract: audioStudioProof.master_report_contract,
      audio_studio_master_report_qc_contract: audioStudioProof.master_report_qc_contract,
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
