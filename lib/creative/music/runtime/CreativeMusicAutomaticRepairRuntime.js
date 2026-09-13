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

  const [{ executeMusicAutoStudioLocal }, { runMusicDailiesListening }, { runMusicFinalTribunal }] = await Promise.all([
    import("./CreativeMusicAutoStudioExecutionRuntime.js"),
    import("./CreativeMusicDailiesListeningRuntime.js"),
    import("./CreativeMusicRepairAndTribunalRuntime.js"),
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
  const repairedAsset = {
    id: null,
    title: asset.title || "Music correction candidate",
    file_url: local.output?.master_url || null,
    metadata: {
      ...object(asset.metadata),
      master_report: object(local.output?.master_report),
      music_automatic_correction: true,
      music_automatic_correction_attempt: 1,
    },
  };
  if (!text(repairedAsset.file_url)) {
    throw new Error("CREATIVE_MUSIC_AUTOMATIC_REPAIR_MASTER_REQUIRED");
  }
  const reviewed = await runMusicDailiesListening({
    organization_id,
    asset: repairedAsset,
    binding,
    master_report: repairedAsset.metadata.master_report,
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
    repaired_asset: repairedAsset,
    dailies: reviewed,
    tribunal: finalReview,
    release_ready: finalReview?.release_ready === true,
    publication_authorized: false,
  };
}

export const CreativeMusicAutomaticRepairRuntime = Object.freeze({
  contract: CONTRACT,
  maxAutomaticLocalRepairAttempts: MAX_AUTOMATIC_LOCAL_REPAIR_ATTEMPTS,
  run: runAutomaticMusicRepair,
});
