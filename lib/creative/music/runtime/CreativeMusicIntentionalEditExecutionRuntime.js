import { executeService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import { buildMusicTransformationPlan } from "@/lib/creative/runtime/engines/MusicEngine";
import { CreativeMusicFinishingRuntime, musicStorageReference } from "./CreativeMusicFinishingRuntime";
import { runMusicDailiesListening } from "./CreativeMusicDailiesListeningRuntime.js";
import { runMusicFinalTribunal } from "./CreativeMusicRepairAndTribunalRuntime.js";
import { loadMusicConversationState, musicConversationExecutionContext } from "./CreativeMusicConversationStateRuntime.js";
import { buildMusicChangeSet } from "./CreativeMusicChangeSetRuntime.js";

const CONTRACT = "AVANTIQO_MUSIC_INTENTIONAL_EDIT_EXECUTION_V1";
function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function publicAsset(asset) {
  if (!asset) return null;
  return { id: asset.id, title: asset.title || asset.name || asset.file_name || null, file_url: asset.file_url || null, metadata: asset.metadata || {} };
}
async function exactAsset({ organization_id, creative_project_id, master_asset_id }) {
  const asset = await CreativeAssetsRuntime.get(master_asset_id);
  if (!asset || text(asset.organization_id) !== text(organization_id) || text(asset.creative_project_id) !== text(creative_project_id)) {
    throw new Error("CREATIVE_MUSIC_INTENTIONAL_EDIT_ASSET_NOT_FOUND");
  }
  return asset;
}

async function persistEditedSource({ organizationId, projectId, missionId, sourceAsset, result, changeSet }) {
  const reference = musicStorageReference(result);
  if (!reference) throw new Error("CREATIVE_MUSIC_INTENTIONAL_EDIT_OUTPUT_REQUIRED");
  const sourceVersion = Number(sourceAsset.metadata?.music_version || 0);
  return CreativeAssetsRuntime.create({
    organization_id: organizationId,
    creative_project_id: projectId,
    creative_mission_id: missionId || null,
    asset_type: "AUDIO",
    file_url: reference,
    file_name: `music-intentional-edit-v${sourceVersion + 1}.wav`,
    name: `${sourceAsset.title || sourceAsset.name || "Music"} - Intentional Edit`,
    title: `${sourceAsset.title || sourceAsset.name || "Music"} - Intentional Edit`,
    description: "Governed scoped Music Studio edit preserving approved material outside the requested region.",
    ai_generated: true,
    provider: result.provider || "avantiqo-audio",
    engine: "AVANTIQO_MUSIC",
    prompt: null,
    metadata: {
      ...(sourceAsset.metadata || {}),
      media_kind: "MUSIC",
      music_asset_kind: "SOURCE",
      music_version: sourceVersion + 1,
      music_usage_id: result?.usage?.id || null,
      parent_music_asset_id: sourceAsset.id,
      music_operation: "INTENTIONAL_SCOPED_EDIT",
      music_change_set_contract: changeSet.contract,
      music_change_set_fingerprint: changeSet.change_set_fingerprint,
      music_change_set_target_range: changeSet.target_range,
      music_change_set_intended_delta: changeSet.intended_delta,
      preserve_outside_region: true,
      release_candidate: false,
      music_pipeline_status: "EDITED_PENDING_DAILIES",
      edited_at: new Date().toISOString(),
    },
  });
}
export async function executeMusicIntentionalEdit({
  organization_id,
  creative_project_id,
  creative_mission_id = null,
  master_asset_id,
  instruction,
  target_range,
  intended_delta,
  expected_change_set_fingerprint,
  allow_protected_overlap = false,
  source_rights_confirmed = false,
} = {}) {
  if (!organization_id || !creative_project_id || !master_asset_id || !expected_change_set_fingerprint) {
    throw new Error("CREATIVE_MUSIC_INTENTIONAL_EDIT_CONTEXT_REQUIRED");
  }
  if (source_rights_confirmed !== true) {
    const error = new Error("CREATIVE_MUSIC_INTENTIONAL_EDIT_SOURCE_RIGHTS_REQUIRED");
    error.status = 400;
    throw error;
  }
  const sourceAsset = await exactAsset({ organization_id, creative_project_id, master_asset_id });
  const loaded = await loadMusicConversationState({ organization_id, creative_project_id });
  const conversationContext = musicConversationExecutionContext(loaded.state);
  const changeSet = buildMusicChangeSet({
    creative_project_id,
    master_asset_id,
    instruction,
    target_range,
    intended_delta,
    conversation_context: conversationContext,
    allow_protected_overlap,
  });
  if (text(changeSet.change_set_fingerprint) !== text(expected_change_set_fingerprint)) {
    const error = new Error("CREATIVE_MUSIC_CHANGE_SET_CHANGED");
    error.status = 409;
    error.code = "CREATIVE_MUSIC_CHANGE_SET_CHANGED";
    throw error;
  }
  if (changeSet.execution_ready !== true) {
    const error = new Error(`CREATIVE_MUSIC_CHANGE_SET_NOT_READY:${changeSet.blockers.join(",")}`);
    error.status = 409;
    error.code = "CREATIVE_MUSIC_CHANGE_SET_NOT_READY";
    error.blockers = changeSet.blockers;
    throw error;
  }
  const transform = buildMusicTransformationPlan("edit", {
    source_audio: sourceAsset.file_url,
    source_rights_confirmed: true,
    edit_start_seconds: changeSet.target_range.start_seconds,
    edit_end_seconds: changeSet.target_range.end_seconds,
    title: sourceAsset.title || sourceAsset.name || "Music intentional edit",
    instrumental: sourceAsset.metadata?.music_session?.instrumental === true,
  });
  transform.generation = { ...transform.generation, caption: changeSet.intended_delta };
  if (transform.executable !== true || transform.certification !== "CERTIFIED") {
    const error = new Error(`CREATIVE_MUSIC_INTENTIONAL_EDIT_NOT_CERTIFIED:${transform.certification}`);
    error.status = 503;
    error.code = "CREATIVE_MUSIC_INTENTIONAL_EDIT_NOT_CERTIFIED";
    throw error;
  }
  const result = await executeService({
    organization_id,
    bill_to_organization_id: organization_id,
    service_id: transform.service_id,
    capability: transform.capability,
    input: {
      source_audio: transform.source_audio,
      task_type: transform.task_type,
      rights_attestation: transform.rights_attestation,
      generation: transform.generation,
      provider_parameters: transform.provider_parameters,
      requirements: { output_spec: transform.output_spec },
      output_spec: transform.output_spec,
    },
    metadata: {
      module: "CREATIVE",
      operation: "AVANTIQO_MUSIC_INTENTIONAL_SCOPED_EDIT",
      creative_project_id,
      creative_mission_id,
      source_master_asset_id: master_asset_id,
      music_change_set_fingerprint: changeSet.change_set_fingerprint,
      target_range: changeSet.target_range,
      intended_delta: changeSet.intended_delta,
      preserve_outside_region: true,
      provider_selection_exposed: false,
      user_prompt_surface: false,
    },
    provider_policy: { preferred_providers: ["avantiqo-audio"] },
    category: "AI",
  });
  if (result?.pending === true || result?.failed === true) {
    return {
      contract: CONTRACT,
      status: result?.pending === true ? "INTENTIONAL_EDIT_PENDING" : "INTENTIONAL_EDIT_FAILED",
      pending: result?.pending === true,
      failed: result?.failed === true,
      provider_status: result?.provider_status || null,
      usage_id: result?.usage?.id || null,
      change_set: changeSet,
      release_ready: false,
      publication_authorized: false,
    };
  }

  const editedSource = await persistEditedSource({
    organizationId: organization_id,
    projectId: creative_project_id,
    missionId: creative_mission_id,
    sourceAsset,
    result,
    changeSet,
  });
  const binding = object(sourceAsset.metadata?.music_production_binding);
  const qualityPlan = object(sourceAsset.metadata?.music_world_class_plan);
  if (!text(qualityPlan.contract)) throw new Error("CREATIVE_MUSIC_INTENTIONAL_EDIT_QUALITY_PLAN_REQUIRED");
  const session = {
    ...(object(sourceAsset.metadata?.music_session)),
    title: editedSource.title || "Intentional Music edit",
    mastering_profile: sourceAsset.metadata?.mastering_profile || "streaming",
    music_production_binding: binding,
    music_direction_contract: object(sourceAsset.metadata?.music_direction_contract),
  };
  const finishing = await CreativeMusicFinishingRuntime.ensureMaster({
    organizationId: organization_id,
    projectId: creative_project_id,
    missionId: creative_mission_id,
    sourceAsset: editedSource,
    session,
    usage: result?.usage || null,
    result,
  });
  if (!finishing?.master_asset?.file_url) {
    return {
      contract: CONTRACT,
      status: "INTENTIONAL_EDIT_FINISHING_PENDING",
      change_set: changeSet,
      edited_asset: publicAsset(editedSource),
      finishing,
      release_ready: false,
      publication_authorized: false,
    };
  }
  const dailies = await runMusicDailiesListening({
    organization_id,
    asset: finishing.master_asset,
    binding,
    master_report: finishing.master_asset.metadata?.master_report || finishing.master_asset.metadata || {},
  });
  const tribunal = await runMusicFinalTribunal({
    organization_id,
    plan: qualityPlan,
    binding,
    dailies,
    master_report: finishing.master_asset.metadata?.master_report || finishing.master_asset.metadata || {},
  });
  return {
    contract: CONTRACT,
    status: tribunal.release_ready ? "INTENTIONAL_EDIT_RELEASE_CANDIDATE" : tribunal.status,
    change_set: changeSet,
    edited_asset: publicAsset(editedSource),
    master_asset: finishing.master_asset,
    finishing,
    dailies,
    tribunal,
    release_ready: tribunal.release_ready === true,
    publication_authorized: false,
  };
}

export const CreativeMusicIntentionalEditExecutionRuntime = Object.freeze({
  contract: CONTRACT,
  execute: executeMusicIntentionalEdit,
});
