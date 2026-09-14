import { executeService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import { CreativeMusicFinishingRuntime, musicStorageReference } from "./CreativeMusicFinishingRuntime";
import { runMusicDailiesListening } from "./CreativeMusicDailiesListeningRuntime.js";
import { runMusicFinalTribunal } from "./CreativeMusicRepairAndTribunalRuntime.js";
import { planMusicSurgicalRepair, buildCertifiedSurgicalEdit } from "./CreativeMusicSurgicalRepairRuntime.js";

const CONTRACT = "AVANTIQO_MUSIC_SURGICAL_REPAIR_EXECUTION_V1";
function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function publicAsset(asset) {
  if (!asset) return null;
  return { id: asset.id, title: asset.title || asset.name || asset.file_name || null, file_url: asset.file_url || null, metadata: asset.metadata || {} };
}
async function persistRepairAsset({ organizationId, projectId, missionId, sourceAsset, result, plan }) {
  const reference = musicStorageReference(result);
  if (!reference) throw new Error("CREATIVE_MUSIC_SURGICAL_REPAIR_OUTPUT_REQUIRED");
  const sourceVersion = Number(sourceAsset.metadata?.music_version || 0);
  return CreativeAssetsRuntime.create({
    organization_id: organizationId,
    creative_project_id: projectId,
    creative_mission_id: missionId || null,
    asset_type: "AUDIO",
    file_url: reference,
    file_name: `music-surgical-repair-v${sourceVersion + 1}.wav`,
    name: `${sourceAsset.title || sourceAsset.name || "Music"} - Surgical Repair`,
    title: `${sourceAsset.title || sourceAsset.name || "Music"} - Surgical Repair`,
    description: "Governed surgical Music Studio correction candidate preserving approved material outside the failed region.",
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
      music_session_id: result?.usage?.id ? `music:${result.usage.id}` : null,
      music_source_task_id: null,
      music_finish_task_id: null,
      master_asset_id: null,
      parent_music_asset_id: sourceAsset.id,
      music_operation: "SURGICAL_REPAIR",
      surgical_repair_contract: CONTRACT,
      surgical_repair_plan_hash: plan.repair_plan_hash,
      surgical_repair_region: plan.selected_region,
      preserve_outside_region: true,
      release_candidate: false,
      music_pipeline_status: "REPAIRED_PENDING_DAILIES",
      repaired_at: new Date().toISOString(),
    },
  });
}

export async function executeMusicSurgicalRepair({
  organization_id,
  creative_project_id,
  creative_mission_id = null,
  master_asset_id,
  expected_repair_plan_hash,
  source_rights_confirmed = false,
  plan = {},
} = {}) {
  if (!organization_id || !creative_project_id || !master_asset_id || !expected_repair_plan_hash) {
    throw new Error("CREATIVE_MUSIC_SURGICAL_REPAIR_EXECUTION_CONTEXT_REQUIRED");
  }
  const verifiedPlan = await planMusicSurgicalRepair({
    organization_id,
    creative_project_id,
    master_asset_id,
    source_rights_confirmed,
  });
  if (text(verifiedPlan.repair_plan_hash) !== text(expected_repair_plan_hash)) {
    const error = new Error("CREATIVE_MUSIC_SURGICAL_REPAIR_PLAN_CHANGED");
    error.status = 409;
    error.code = "CREATIVE_MUSIC_SURGICAL_REPAIR_PLAN_CHANGED";
    throw error;
  }
  const transform = buildCertifiedSurgicalEdit(verifiedPlan, { source_rights_confirmed });
  const sourceAsset = await CreativeAssetsRuntime.get(master_asset_id);
  if (!sourceAsset) throw new Error("CREATIVE_MUSIC_SURGICAL_REPAIR_ASSET_NOT_FOUND");
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
      operation: "AVANTIQO_MUSIC_SURGICAL_REPAIR_EXECUTE",
      creative_project_id,
      creative_mission_id,
      repair_plan_hash: verifiedPlan.repair_plan_hash,
      source_master_asset_id: master_asset_id,
      selected_region: verifiedPlan.selected_region,
      source_rights_attestation: transform.rights_attestation,
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
      status: result?.pending === true ? "SURGICAL_REPAIR_PENDING" : "SURGICAL_REPAIR_FAILED",
      pending: result?.pending === true,
      failed: result?.failed === true,
      provider_status: result?.provider_status || null,
      usage_id: result?.usage?.id || null,
      repair_plan: verifiedPlan,
      release_ready: false,
      publication_authorized: false,
    };
  }
  const repairedSource = await persistRepairAsset({
    organizationId: organization_id,
    projectId: creative_project_id,
    missionId: creative_mission_id,
    sourceAsset,
    result,
    plan: verifiedPlan,
  });
  const qualityPlan = object(sourceAsset.metadata?.music_world_class_plan);
  if (!text(qualityPlan.contract)) throw new Error("CREATIVE_MUSIC_SURGICAL_REPAIR_QUALITY_PLAN_REQUIRED");
  const binding = object(sourceAsset.metadata?.music_production_binding);
  const session = {
    ...(object(sourceAsset.metadata?.music_session)),
    title: repairedSource.title || "Surgical Music repair",
    mastering_profile: sourceAsset.metadata?.mastering_profile || "streaming",
    music_production_binding: binding,
    music_direction_contract: object(sourceAsset.metadata?.music_direction_contract),
  };
  const finishing = await CreativeMusicFinishingRuntime.ensureMaster({
    organizationId: organization_id,
    projectId: creative_project_id,
    missionId: creative_mission_id,
    sourceAsset: repairedSource,
    session,
    usage: result?.usage || null,
    result,
  });
  if (!finishing?.master_asset?.file_url) {
    return { contract: CONTRACT, status: "SURGICAL_REPAIR_FINISHING_PENDING", repaired_asset: publicAsset(repairedSource), finishing, release_ready: false, publication_authorized: false };
  }
  const dailies = await runMusicDailiesListening({
    organization_id,
    creative_project_id,
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
    status: tribunal.release_ready ? "SURGICAL_REPAIR_RELEASE_CANDIDATE" : tribunal.status,
    repair_plan: verifiedPlan,
    repaired_asset: publicAsset(repairedSource),
    master_asset: finishing.master_asset,
    finishing,
    dailies,
    tribunal,
    release_ready: tribunal.release_ready === true,
    publication_authorized: false,
  };
}

export const CreativeMusicSurgicalRepairExecutionRuntime = Object.freeze({
  contract: CONTRACT,
  execute: executeMusicSurgicalRepair,
});
