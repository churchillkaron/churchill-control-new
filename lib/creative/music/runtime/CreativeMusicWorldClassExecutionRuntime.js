import { executeService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { CreativeMusicFinishingRuntime } from "./CreativeMusicFinishingRuntime";
import { executeMusicAutoStudioLocal } from "./CreativeMusicAutoStudioExecutionRuntime";
import { buildMusicGenerationPlan } from "@/lib/creative/runtime/engines/MusicEngine";
import { buildWorldClassMusicStudioPlan } from "./CreativeMusicWorldClassStudioRuntime";
import { executeMusicCreativeFloor } from "./CreativeMusicCreativeFloorExecutionRuntime.js";
import { bindMusicPreproductionToGeneration } from "./CreativeMusicProductionBindingRuntime.js";
import { runMusicDailiesListening } from "./CreativeMusicDailiesListeningRuntime.js";
import { runMusicFinalTribunal } from "./CreativeMusicRepairAndTribunalRuntime.js";
import { runAutomaticMusicRepair } from "./CreativeMusicAutomaticRepairRuntime.js";
import { buildMusicIntendedVsRenderedReview, buildMusicQualityTribunal } from "./CreativeMusicWorldClassQualityRuntime";

const CONTRACT = "AVANTIQO_WORLD_CLASS_MUSIC_EXECUTION_V1";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function publicAsset(asset) {
  if (!asset) return null;
  return {
    id: asset.id,
    title: asset.title || asset.name || asset.file_name || null,
    file_url: asset.file_url || null,
    asset_type: asset.asset_type || null,
    metadata: asset.metadata || {},
  };
}
function exactPrimaryCapability(plan) {
  const selected = Array.isArray(plan?.selected_capabilities) ? plan.selected_capabilities : [];
  const preferred = ["create_song", "compose_music", "audio_cleanup", "master", "mix"];
  return preferred.find((id) => selected.some((item) => item.id === id)) || selected[0]?.id || null;
}

function assertExecutableSelection(plan) {
  const blockers = Array.isArray(plan?.readiness?.gated_capabilities)
    ? plan.readiness.gated_capabilities
    : [];
  const hardBlocked = blockers.filter((item) => !["compose_music", "create_song"].includes(item.id));
  if (hardBlocked.length) {
    const error = new Error(`CREATIVE_MUSIC_WORLD_CLASS_CAPABILITY_NOT_EXECUTABLE:${hardBlocked.map((item) => item.id).join(",")}`);
    error.code = "CREATIVE_MUSIC_WORLD_CLASS_CAPABILITY_NOT_EXECUTABLE";
    error.status = 503;
    error.blockers = hardBlocked;
    throw error;
  }
}


export function worldClassMusicQualityPending(plan = {}, evidence = {}) {
  const review = buildMusicIntendedVsRenderedReview({ plan, evidence });
  const tribunal = buildMusicQualityTribunal({ plan, review, evidence });
  return {
    contract: tribunal.contract,
    status: tribunal.release_ready ? "PASS" : "QUALITY_REVIEW_REQUIRED",
    release_ready: tribunal.release_ready,
    intended_vs_rendered: review,
    tribunal,
    publication_authorized: false,
  };
}

async function executeGeneratedMusic(input, plan) {
  const organizationId = text(input.organization_id);
  const creativeFloor = input.creative_floor || await executeMusicCreativeFloor({ ...input, organization_id: organizationId });
  if (text(creativeFloor.status) !== "READY_FOR_PRODUCTION_CONFIRMATION") {
    return { success: false, pending: false, failed: false, plan, creative_floor: creativeFloor, production_started: false, release_ready: false, publish_authorized: false };
  }
  const bound = bindMusicPreproductionToGeneration({ input, creative_floor: creativeFloor });
  const generation = buildMusicGenerationPlan({
    ...bound.input,
    title: input.title || plan.title,
  });
  const session = {
    ...generation.session,
    music_production_binding: bound.binding,
    music_direction_contract: bound.input.music_direction_contract,
    music_world_class_plan: plan,
    objective: input.objective || null,
    mastering_destinations: Array.isArray(input.mastering_destinations) ? input.mastering_destinations : null,
  };
  const result = await executeService({
    organization_id: organizationId,
    bill_to_organization_id: organizationId,
    entity_id: text(input.entity_id) || null,
    service_id: generation.service_id,
    capability: generation.capability,
    input: {
      title: session.title,
      description: session.direction,
      quantity: session.duration_seconds,
      currency: text(input.currency || "THB"),
      generation: generation.generation,
      requirements: { output_spec: generation.output_spec },
      output_spec: generation.output_spec,
    },
    metadata: {
      module: "CREATIVE",
      operation: "AVANTIQO_WORLD_CLASS_MUSIC_EXECUTE",
      creative_project_id: text(input.creative_project_id) || null,
      creative_mission_id: text(input.creative_mission_id) || null,
      world_class_music_contract: plan.contract,
      world_class_music_primary_capability: exactPrimaryCapability(plan),
      world_class_music_workers: plan.workers.map((worker) => worker.id),
      world_class_music_phases: plan.phases.map((phase) => phase.phase),
      music_production_binding: bound.binding,
      music_session: {
        title: session.title,
        style: session.style,
        mood: session.mood,
        energy: session.energy,
        instrumentation: session.instrumentation,
        structure: session.structure,
        duration_seconds: session.duration_seconds,
        bpm: session.bpm,
        keyscale: session.keyscale || null,
        timesignature: session.timesignature,
        instrumental: session.instrumental,
        vocal_language: session.vocal_language,
        mastering_profile: session.mastering_profile,
      },
      provider_selection_exposed: false,
      user_prompt_surface: false,
    },
    provider_policy: { preferred_providers: ["avantiqo-audio"] },
    category: generation.category,
  });
  if (result?.pending === true || result?.failed === true) {
    return {
      success: result?.success !== false,
      pending: result?.pending === true,
      failed: result?.failed === true,
      provider_status: result?.provider_status || null,
      settlement: result?.settlement || null,
      usage_id: result?.usage?.id || null,
      plan,
      creative_floor: creativeFloor,
      production_binding: bound.binding,
      session,
      output: result?.output || null,
      quality: worldClassMusicQualityPending(plan, {}),
      release_ready: false,
      publish_authorized: false,
    };
  }

  const usage = result?.usage || null;
  const sourceAsset = await CreativeMusicFinishingRuntime.persistGeneration({
    organizationId,
    projectId: text(input.creative_project_id) || null,
    missionId: text(input.creative_mission_id) || null,
    result,
    session,
    usage,
  });
  const finishing = sourceAsset ? await CreativeMusicFinishingRuntime.ensureMasters({
    organizationId,
    projectId: text(input.creative_project_id) || null,
    missionId: text(input.creative_mission_id) || null,
    sourceAsset,
    session,
    usage,
    result,
    objective: input.objective || null,
    retryFailed: input.retry_finishing === true,
  }) : null;
  const dailies = finishing?.master_asset?.file_url ? await runMusicDailiesListening({
    organization_id: organizationId,
    asset: finishing.master_asset,
    binding: bound.binding,
    master_report: finishing.master_asset.metadata?.master_report || finishing.master_asset.metadata || {},
  }) : null;
  const tribunal = dailies ? await runMusicFinalTribunal({
    organization_id: organizationId,
    plan,
    binding: bound.binding,
    dailies,
    master_report: finishing?.master_asset?.metadata?.master_report || finishing?.master_asset?.metadata || {},
  }) : null;
  const automaticRepair = tribunal?.status === "DAILIES_REPAIR_REQUIRED" && finishing?.master_asset
    ? await runAutomaticMusicRepair({
        organization_id: organizationId,
        creative_project_id: text(input.creative_project_id),
        creative_mission_id: text(input.creative_mission_id) || null,
        asset: finishing.master_asset,
        binding: bound.binding,
        dailies,
        plan,
      })
    : null;
  const finalTribunal = automaticRepair?.tribunal || tribunal;

  return {
    success: true,
    pending: false,
    failed: false,
    provider_status: result?.provider_status || "completed",
    settlement: result?.settlement || null,
    usage_id: usage?.id || null,
    plan,
    creative_floor: creativeFloor,
    production_binding: bound.binding,
    session,
    asset: publicAsset(sourceAsset),
    master_asset: finishing?.master_asset || null,
    master_assets: Array.isArray(finishing?.master_variants) ? finishing.master_variants.map((row) => row.finishing?.master_asset).filter(Boolean) : [],
    destination_mastering: finishing?.mastering_plan || null,
    destination_master_qc_passed: finishing?.destination_qc_passed === true,
    finishing: finishing || null,
    dailies: dailies || null,
    tribunal: finalTribunal || null,
    repair: automaticRepair || tribunal?.repair || null,
    output: result?.output || null,
    quality: finalTribunal ? {
      status: finalTribunal.release_ready === true && finishing?.destination_qc_passed === true ? "PASS" : (finishing?.destination_qc_passed === false ? "DESTINATION_MASTER_QC_REQUIRED" : finalTribunal.status),
      release_ready: finalTribunal.release_ready === true && finishing?.destination_qc_passed === true,
      intended_vs_rendered: finalTribunal.review || null,
      tribunal: finalTribunal.tribunal || null,
      destination_master_qc_passed: finishing?.destination_qc_passed === true,
      publication_authorized: false,
    } : worldClassMusicQualityPending(plan, { master_report: finishing?.master_asset?.metadata || {} }),
    release_ready: finalTribunal?.release_ready === true && finishing?.destination_qc_passed === true,
    publish_authorized: false,
  };
}
async function executeSourceProduction(input, plan) {
  const sourceMedia = text(input.source_media || input.source_audio || input.audio);
  if (!sourceMedia) {
    const error = new Error("CREATIVE_MUSIC_WORLD_CLASS_SOURCE_REQUIRED");
    error.status = 400;
    throw error;
  }
  const result = await executeMusicAutoStudioLocal({
    ...input,
    organization_id: text(input.organization_id),
    creative_project_id: text(input.creative_project_id),
    creative_mission_id: text(input.creative_mission_id) || null,
    source_media: sourceMedia,
    source_audio: sourceMedia,
    source_rights_confirmed: input.source_rights_confirmed === true,
    title: input.title || plan.title,
  });
  return {
    ...result,
    plan,
    quality: worldClassMusicQualityPending(plan, {
      source_present: true,
      source_rights_required: true,
      source_rights_confirmed: input.source_rights_confirmed === true,
      original_source_preserved: true,
      master_report: result.output?.master_report || {},
    }),
    release_ready: false,
    publish_authorized: false,
  };
}

export async function executeWorldClassMusicStudio(input = {}) {
  const organizationId = text(input.organization_id);
  const projectId = text(input.creative_project_id);
  if (!organizationId) throw new Error("organization_id required");
  if (!projectId) throw new Error("creative_project_id required");

  const plan = buildWorldClassMusicStudioPlan(input);
  assertExecutableSelection(plan);
  const primary = exactPrimaryCapability(plan);
  const source = text(input.source_media || input.source_audio || input.audio);

  if (["compose_music", "create_song"].includes(primary)) {
    return executeGeneratedMusic(input, plan);
  }
  if (source && ["audio_cleanup", "mix", "master"].includes(primary)) {
    return executeSourceProduction(input, plan);
  }

  const error = new Error(`CREATIVE_MUSIC_WORLD_CLASS_EXECUTION_PATH_NOT_READY:${primary || "UNKNOWN"}`);
  error.code = "CREATIVE_MUSIC_WORLD_CLASS_EXECUTION_PATH_NOT_READY";
  error.status = 503;
  throw error;
}

export const CreativeMusicWorldClassExecutionRuntime = Object.freeze({
  contract: CONTRACT,
  execute: executeWorldClassMusicStudio,
});
