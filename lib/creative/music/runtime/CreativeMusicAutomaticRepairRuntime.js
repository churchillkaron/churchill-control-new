import { classifyMusicRepair } from "./CreativeMusicRepairContractRuntime.js";

const CONTRACT = "AVANTIQO_MUSIC_AUTOMATIC_REPAIR_V1";
const MAX_AUTOMATIC_LOCAL_REPAIR_ATTEMPTS = 1;

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

export async function runAutomaticMusicRepair({
  organization_id,
  creative_project_id,
  creative_mission_id = null,
  asset = {},
  binding = {},
  dailies = {},
  plan = {},
} = {}) {
  const classification = classifyMusicRepair({ dailies });
  if (dailies?.report?.passed === true) {
    return { contract: CONTRACT, status: "NO_REPAIR_REQUIRED", attempts: 0, dailies };
  }
  if (classification.zero_cost_local_repair_allowed !== true) {
    return {
      contract: CONTRACT,
      status: "GOVERNED_SURGICAL_REPAIR_REQUIRED",
      attempts: 0,
      classification,
      dailies,
      release_ready: false,
      publication_authorized: false,
    };
  }

  const source = text(asset.file_url || asset.audio_url);
  if (!organization_id || !creative_project_id || !source) {
    throw new Error("CREATIVE_MUSIC_AUTOMATIC_REPAIR_CONTEXT_REQUIRED");
  }

  const [{ executeMusicAutoStudioLocal }, { runMusicDailiesListening }, { runMusicFinalTribunal }, { CreativeAssetsRuntime }, { CreativeMusicFinishingRuntime }] = await Promise.all([
    import("./CreativeMusicAutoStudioExecutionRuntime.js"),
    import("./CreativeMusicDailiesListeningRuntime.js"),
    import("./CreativeMusicRepairAndTribunalRuntime.js"),
    import("@/lib/creative/assets/runtime/CreativeAssetsRuntime"),
    import("./CreativeMusicFinishingRuntime.js"),
  ]);
  const local = await executeMusicAutoStudioLocal({
    organization_id,
    creative_project_id,
    creative_mission_id,
    source_media: source,
    source_audio: source,
    source_rights_confirmed: true,
    source_role: "program",
    title: `${asset.title || "Music"} — Local repair`,
  });
  const originalSourceId = text(asset.metadata?.source_asset_id || asset.metadata?.music_generation_source_asset_id);
  const originalSource = originalSourceId ? await CreativeAssetsRuntime.get(originalSourceId) : null;
  const parentSource = originalSource || asset;
  const sourceVersion = Number(parentSource.metadata?.music_version || 0);
  const repairedSource = await CreativeAssetsRuntime.create({
    organization_id,
    creative_project_id,
    creative_mission_id: creative_mission_id || null,
    asset_type: "AUDIO",
    file_url: local.output?.master_url || null,
    file_name: `music-technical-repair-v${sourceVersion + 1}.wav`,
    name: `${parentSource.title || parentSource.name || "Music"} — Technical Repair`,
    title: `${parentSource.title || parentSource.name || "Music"} — Technical Repair`,
    description: "Automatic local technical repair promoted to a new immutable Music source generation before destination remastering.",
    ai_generated: true,
    provider: "avantiqo-local-audio-worker",
    engine: "AVANTIQO_AUDIO_FINISHING",
    prompt: null,
    metadata: {
      ...object(parentSource.metadata),
      media_kind: "MUSIC",
      music_asset_kind: "SOURCE",
      music_version: sourceVersion + 1,
      parent_music_asset_id: parentSource.id || originalSourceId || null,
      music_operation: "AUTOMATIC_TECHNICAL_REPAIR",
      music_source_task_id: null,
      music_finish_task_id: null,
      master_asset_id: null,
      music_generation_id: null,
      music_master_set_id: null,
      music_pipeline_status: "REPAIRED_PENDING_REMASTER",
      music_automatic_correction: true,
      music_automatic_correction_attempt: 1,
      music_release_manifest: null,
      music_release_manifest_fingerprint: null,
      music_release_ready: false,
      music_destination_qc: null,
      music_perceptual_translation_qc: null,
      music_dailies: null,
      music_final_tribunal: null,
      music_listening_evidence: null,
      repaired_at: new Date().toISOString(),
    },
  });
  if (!text(repairedSource.file_url)) throw new Error("CREATIVE_MUSIC_AUTOMATIC_REPAIR_MASTER_REQUIRED");
  const session = {
    ...object(parentSource.metadata?.music_session),
    title: repairedSource.title || "Music technical repair",
    mastering_profile: parentSource.metadata?.mastering_profile || "streaming",
    mastering_destinations: Array.isArray(parentSource.metadata?.mastering_destinations) ? parentSource.metadata.mastering_destinations : null,
    music_production_binding: object(parentSource.metadata?.music_production_binding),
    music_direction_contract: object(parentSource.metadata?.music_direction_contract),
    music_world_class_plan: object(parentSource.metadata?.music_world_class_plan),
  };
  const finishing = await CreativeMusicFinishingRuntime.ensureMasters({
    organizationId: organization_id,
    projectId: creative_project_id,
    missionId: creative_mission_id,
    sourceAsset: repairedSource,
    session,
    objective: session.title,
  });
  const repairedAsset = finishing?.master_asset || null;
  if (!text(repairedAsset?.file_url)) {
    return { contract: CONTRACT, status: "REPAIR_REMASTER_PENDING", attempts: MAX_AUTOMATIC_LOCAL_REPAIR_ATTEMPTS, classification, repaired_source: repairedSource, finishing, release_ready: false, publication_authorized: false };
  }
  const reviewed = await runMusicDailiesListening({
    organization_id,
    creative_project_id,
    asset: repairedAsset,
    binding,
    master_report: repairedAsset.metadata?.master_report || {},
    translation_qc: finishing?.perceptual_translation || null,
  });
  const finalReview = reviewed.report?.passed === true ? await runMusicFinalTribunal({
    organization_id,
    plan,
    binding,
    dailies: reviewed,
    master_report: repairedAsset.metadata.master_report,
  }) : null;
  return {
    contract: CONTRACT,
    status: finalReview?.release_ready === true ? "REPAIRED_RELEASE_CANDIDATE" : "REPAIR_EXHAUSTED",
    attempts: MAX_AUTOMATIC_LOCAL_REPAIR_ATTEMPTS,
    classification,
    local_execution: local.execution,
    repaired_source: repairedSource,
    repaired_asset: repairedAsset,
    finishing,
    dailies: reviewed,
    tribunal: finalReview,
    release_ready: finalReview?.release_ready === true && finishing?.release_ready === true,
    publication_authorized: false,
  };
}

export const CreativeMusicAutomaticRepairRuntime = Object.freeze({
  contract: CONTRACT,
  maxAutomaticLocalRepairAttempts: MAX_AUTOMATIC_LOCAL_REPAIR_ATTEMPTS,
  run: runAutomaticMusicRepair,
});
