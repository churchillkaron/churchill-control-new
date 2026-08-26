import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

export const MUSIC_VOCAL_CORRECTION_TASK_CONTRACT =
  "AVANTIQO_MUSIC_VOCAL_CORRECTION_TASK_V1";
export const MUSIC_VOCAL_CORRECTION_ENGINE_CONTRACT =
  "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2";
export const MUSIC_VOCAL_CORRECTION_QUALITY_PROFILE =
  "TORCHCREPE_SIGNALSMITH_VOCAL_CORRECTION_V2";
export const MUSIC_VOCAL_CORRECTION_SAFE_LEASE_CONTRACT =
  "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
export const MUSIC_VOCAL_CORRECTION_SAFE_LEASE_LANE =
  "music-vocal-correction";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function correctionDefaults(input = {}) {
  const source = object(input);
  return {
    source_role: "isolated_vocal",
    key: text(source.key) || null,
    bpm: Number.isFinite(Number(source.bpm)) ? Number(source.bpm) : null,
    beat_offset_seconds: Number.isFinite(Number(source.beat_offset_seconds))
      ? Math.max(0, Number(source.beat_offset_seconds))
      : 0,
    pitch_strength: 0.72,
    timing_strength: 0.45,
    max_pitch_shift_cents: 160,
    max_timing_shift_ms: 80,
    snap_threshold_cents: 24,
    preserve_vibrato: true,
    preserve_formants: true,
  };
}

export function musicVocalCorrectionEligibility({ plan, restoration } = {}) {
  const sourceRole = text(plan?.source?.source_role).toLowerCase();
  const isolatedVocal = sourceRole === "vocal" || sourceRole === "isolated_vocal";
  if (isolatedVocal) {
    return {
      eligible: true,
      source_role: sourceRole,
      disposition: "QUEUE_CERTIFIED_VOCAL_CORRECTION_AFTER_V1_RESTORATION",
      blocker: null,
    };
  }
  return {
    eligible: false,
    source_role: sourceRole || null,
    disposition: "STEM_SEPARATION_REQUIRED_BEFORE_VOCAL_CORRECTION",
    blocker: {
      stage: "vocal_engineering",
      code: "ISOLATED_VOCAL_STEM_REQUIRED",
      message: "Pitch and phrase-timing correction must run on an isolated vocal. Separate the vocal stem first, then correct it and remix before mastering.",
      safe_lease_required: true,
      safe_lease_contract: MUSIC_VOCAL_CORRECTION_SAFE_LEASE_CONTRACT,
    },
  };
}

export async function createMusicVocalCorrectionRequestTask({
  organizationId,
  projectId,
  missionId = null,
  plan,
  restoredTask,
  restoration,
} = {}) {
  if (!text(organizationId)) throw new Error("organization_id required");
  if (!text(projectId)) throw new Error("creative_project_id required");
  if (!restoredTask?.id) throw new Error("MUSIC_VOCAL_CORRECTION_RESTORED_SOURCE_TASK_REQUIRED");

  const eligibility = musicVocalCorrectionEligibility({ plan, restoration });
  if (!eligibility.eligible) {
    return {
      created: false,
      eligibility,
      task: null,
    };
  }

  const rightsAttestation = object(plan?.source?.rights_attestation);
  if (rightsAttestation.confirmed !== true) {
    throw new Error("MUSIC_VOCAL_CORRECTION_SOURCE_RIGHTS_CONFIRMATION_REQUIRED");
  }

  const task = await ProductionTaskRuntime.create({
    organization_id: organizationId,
    creative_project_id: projectId,
    type: "EXECUTE_CAPABILITY",
    status: "WAITING",
    title: `${text(plan?.title) || "Music Auto Studio"} — Vocal Pitch & Timing`,
    description: "Durable request for certified isolated-vocal pitch and whole-phrase timing correction. Execution is permitted only inside the Music vocal-correction Safe Lease V2 lane.",
    service_id: "ai.audio.vocal-correct",
    service_code: "ai.audio.vocal-correct",
    capability: "ai.audio.vocal-correct",
    priority: 80.75,
    depends_on: [restoredTask.id],
    input: {
      source_task_ids: [restoredTask.id],
      source_audio: restoredTask.output?.storage_reference || restoredTask.output?.audio_url || null,
      provider_parameters: {
        rights_attestation: rightsAttestation,
        correction: correctionDefaults({
          key: plan?.analysis?.key || plan?.source?.key,
          bpm: plan?.analysis?.bpm || plan?.source?.bpm,
          beat_offset_seconds: plan?.analysis?.beat_offset_seconds,
        }),
      },
    },
    cost: {
      estimated: null,
      actual: null,
      currency: null,
      approved: false,
    },
    timing: { estimated_seconds: plan?.source?.duration_seconds || 0 },
    review: {
      required: true,
      approved: false,
      reason: "Human listening review is mandatory before vocal-correction production certification.",
    },
    metadata: {
      workflow_kind: "AUDIO",
      production_step_id: "vocal-correct",
      production_step_index: 1.75,
      deliverable_type: "MUSIC",
      creative_mission_id: missionId || null,
      music_auto_studio: true,
      music_auto_studio_contract: plan?.contract || null,
      music_auto_studio_goal: plan?.goal || null,
      music_vocal_correction_task_contract: MUSIC_VOCAL_CORRECTION_TASK_CONTRACT,
      engine_contract: MUSIC_VOCAL_CORRECTION_ENGINE_CONTRACT,
      quality_profile: MUSIC_VOCAL_CORRECTION_QUALITY_PROFILE,
      safe_lease_required: true,
      safe_lease_contract: MUSIC_VOCAL_CORRECTION_SAFE_LEASE_CONTRACT,
      safe_lease_lane: MUSIC_VOCAL_CORRECTION_SAFE_LEASE_LANE,
      direct_runpod_submission_allowed: false,
      direct_workers_max_write_allowed: false,
      production_certification_required: true,
      human_listening_review_required: true,
      source_music_version: 1,
      target_music_version: 2,
      source_task_id: restoredTask.id,
      preserve_vibrato: true,
      preserve_formants: true,
    },
  });

  return {
    created: true,
    eligibility,
    task,
  };
}

export const CreativeMusicVocalCorrectionTaskRuntime = Object.freeze({
  contract: MUSIC_VOCAL_CORRECTION_TASK_CONTRACT,
  eligibility: musicVocalCorrectionEligibility,
  createRequestTask: createMusicVocalCorrectionRequestTask,
});
