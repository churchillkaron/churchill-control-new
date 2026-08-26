import { dispatchAudioTask } from "@/lib/creative/audio/runtime/AudioQueueRuntime";
import { unwrapAudioOutput } from "@/lib/creative/audio/runtime/AudioFinishingContractRuntime";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { buildMusicAutoStudioPlan } from "./CreativeMusicAutoStudioRuntime";
import { processMusicVocalEngineeringLocal } from "./CreativeMusicVocalEngineeringRuntime";

const CONTRACT = "AVANTIQO_MUSIC_AUTO_STUDIO_LOCAL_EXECUTION_V2";
const MUSIC_BUCKET = "creative-assets";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function sourceRoleForAudio(role) {
  return role === "vocal" ? "voice" : "program";
}

function publicOutput(value = {}) {
  const output = object(unwrapAudioOutput(value));
  const report = object(output.master_report);
  return {
    master_url: text(output.master_url || output.audio_url || output.file_url || output.url) || null,
    waveform_url: text(output.waveform_url) || null,
    master_id: text(output.master_id || report.master_id) || null,
    release_candidate: output.release_candidate === true,
    files: Array.isArray(output.files)
      ? output.files.map((file) => ({
          name: file?.name || null,
          url: file?.url || null,
          mime_type: file?.mime_type || null,
          checksum: file?.checksum || null,
        }))
      : [],
    master_report: report,
  };
}

async function createSourceTask({ organizationId, projectId, missionId, plan }) {
  const source = plan.source;
  let task = await ProductionTaskRuntime.create({
    organization_id: organizationId,
    creative_project_id: projectId,
    type: "GENERATE_AUDIO",
    status: "WAITING",
    title: `${plan.title} — Original Source`,
    description: source.media_kind === "video"
      ? "Original performance-video audio source for Avantiqo Music Auto Studio. Picture is preserved and not edited by Music Studio."
      : "Original uploaded source for Avantiqo Music Auto Studio.",
    service_id: "creative.audio.source",
    service_code: "creative.audio.source",
    capability: "creative.audio.source",
    priority: 80,
    input: {
      source_media: source.reference,
      media_kind: source.media_kind,
      source_role: source.source_role,
    },
    cost: { estimated: 0, actual: 0, currency: null, approved: true },
    timing: { estimated_seconds: source.duration_seconds || 0 },
    review: { required: false, approved: true },
    metadata: {
      workflow_kind: "AUDIO",
      production_step_id: "record",
      production_step_index: 1,
      audio_role: sourceRoleForAudio(source.source_role),
      deliverable_type: "MUSIC",
      creative_mission_id: missionId || null,
      music_auto_studio: true,
      music_auto_studio_contract: plan.contract,
      music_auto_studio_goal: plan.goal,
      source_media_kind: source.media_kind,
      source_rights_attestation: source.rights_attestation,
      preserve_original: true,
      source_is_user_upload: true,
      music_source_version: 0,
    },
  });

  task = await ProductionTaskRuntime.complete(task.id, {
    provider: "user-upload",
    settlement: "LOCAL_EXECUTION",
    type: "ASSET",
    file_url: source.reference,
    audio_url: source.reference,
    storage_reference: source.reference,
    mime_type: source.mime_type || null,
    file_name: source.file_name || null,
    source_media_kind: source.media_kind,
    original_preserved: true,
    music_source_version: 0,
  });
  return task;
}

async function createRestoredSourceTask({
  organizationId,
  projectId,
  missionId,
  plan,
  originalTask,
  restoration,
}) {
  let task = await ProductionTaskRuntime.create({
    organization_id: organizationId,
    creative_project_id: projectId,
    type: "EXECUTE_CAPABILITY",
    status: "WAITING",
    title: `${plan.title} — Restored Source`,
    description: "Adaptive Avantiqo Music mic/program restoration before final mix and mastering.",
    service_id: "creative.music.vocal-engineering.local",
    service_code: "creative.music.vocal-engineering.local",
    capability: "creative.music.vocal-engineering.local",
    priority: 80.5,
    depends_on: [originalTask.id],
    input: {
      source_task_ids: [originalTask.id],
      source_media: plan.source.reference,
    },
    cost: { estimated: 0, actual: 0, currency: null, approved: true },
    timing: { estimated_seconds: plan.source.duration_seconds || 0 },
    review: { required: false, approved: true },
    metadata: {
      workflow_kind: "AUDIO",
      production_step_id: "restore",
      production_step_index: 1.5,
      audio_role: sourceRoleForAudio(plan.source.source_role),
      deliverable_type: "MUSIC",
      creative_mission_id: missionId || null,
      music_auto_studio: true,
      music_auto_studio_contract: plan.contract,
      music_auto_studio_goal: plan.goal,
      music_auto_studio_original_task_id: originalTask.id,
      vocal_engineering_contract: restoration.contract,
      engineering_mode: restoration.engineering?.mode || null,
      preserve_original: true,
      music_source_version: 1,
    },
  });

  task = await ProductionTaskRuntime.complete(task.id, {
    provider: "avantiqo-local-music-vocal-engineering",
    settlement: "LOCAL_EXECUTION",
    type: "ASSET",
    file_url: restoration.restored.storage_reference,
    audio_url: restoration.restored.storage_reference,
    storage_reference: restoration.restored.storage_reference,
    mime_type: restoration.restored.mime_type || "audio/wav",
    checksum: restoration.restored.checksum || null,
    probe: restoration.restored.probe || null,
    engineering: restoration.engineering,
    analysis: restoration.analysis,
    readiness: restoration.readiness,
    original_task_id: originalTask.id,
    original_preserved: true,
    music_source_version: 1,
  });
  return task;
}

async function createFinishTask({ organizationId, projectId, missionId, sourceTask, plan }) {
  const mastering = plan.mastering;
  return ProductionTaskRuntime.create({
    organization_id: organizationId,
    creative_project_id: projectId,
    type: "EXECUTE_CAPABILITY",
    status: "WAITING",
    title: `${plan.title} — Auto Studio Master`,
    description: "Canonical Avantiqo Music Auto Studio mix, loudness mastering, true-peak validation, delivery export and waveform evidence from the restored source.",
    service_id: "creative.audio.finish",
    service_code: "creative.audio.finish",
    capability: "creative.audio.finish",
    priority: 81,
    depends_on: [sourceTask.id],
    input: {
      source_task_ids: [sourceTask.id],
      output_spec: {
        title: plan.title,
        tracks: [{
          source_task_id: sourceTask.id,
          role: sourceRoleForAudio(plan.source.source_role),
          label: plan.title,
        }],
        loudness: {
          target_lufs: mastering.target_lufs,
          true_peak_dbtp: mastering.true_peak_dbtp,
          tolerance_lu: 0.5,
          true_peak_tolerance_db: 0.1,
        },
        sample_rate: mastering.sample_rate,
        channels: mastering.channels,
        deliveries: [
          { id: "release-wav", format: "wav", file_name: "master.wav", codec: "pcm_s24le" },
          { id: "release-mp3", format: "mp3", file_name: "master.mp3", bitrate: "320k" },
        ],
        waveform: { width: 1600, height: 400 },
      },
      storage_policy: { bucket: MUSIC_BUCKET },
    },
    cost: { estimated: 0, actual: 0, currency: null, approved: true },
    timing: { estimated_seconds: 0 },
    review: { required: false, approved: false },
    metadata: {
      workflow_kind: "AUDIO",
      production_step_id: "finish",
      production_step_index: 2,
      deliverable_type: "MUSIC",
      release_candidate: true,
      creative_mission_id: missionId || null,
      music_auto_studio: true,
      music_auto_studio_contract: plan.contract,
      music_auto_studio_goal: plan.goal,
      music_auto_studio_source_task_id: sourceTask.id,
      mastering_profile: mastering.profile,
      storage_policy: { bucket: MUSIC_BUCKET },
    },
  });
}

export async function executeMusicAutoStudioLocal(input = {}) {
  const organizationId = text(input.organization_id);
  const projectId = text(input.creative_project_id);
  const missionId = text(input.creative_mission_id) || null;
  if (!organizationId) throw new Error("organization_id required");
  if (!projectId) throw new Error("creative_project_id required");

  const plan = buildMusicAutoStudioPlan(input);
  if (plan.readiness.local_analyze_mix_master_ready !== true) {
    throw new Error("CREATIVE_MUSIC_AUTO_STUDIO_LOCAL_FINISHING_NOT_READY");
  }

  const originalTask = await createSourceTask({
    organizationId,
    projectId,
    missionId,
    plan,
  });
  const restoration = await processMusicVocalEngineeringLocal({
    organization_id: organizationId,
    creative_project_id: projectId,
    source_media: plan.source.reference,
    file_name: plan.source.file_name,
    mime_type: plan.source.mime_type,
    source_role: plan.source.source_role,
  });
  const restoredTask = await createRestoredSourceTask({
    organizationId,
    projectId,
    missionId,
    plan,
    originalTask,
    restoration,
  });
  const finishTask = await createFinishTask({
    organizationId,
    projectId,
    missionId,
    sourceTask: restoredTask,
    plan,
  });
  const completed = await dispatchAudioTask(finishTask);
  if (!completed || completed.status !== "COMPLETED") {
    throw new Error(
      `CREATIVE_MUSIC_AUTO_STUDIO_LOCAL_FINISH_FAILED:${completed?.error || completed?.status || "UNKNOWN"}`,
    );
  }

  const remainingBlockers = plan.readiness.elite_studio_blockers.filter((blocker) => {
    if (blocker.stage !== "vocal_engineering") return true;
    return restoration.readiness.pitch_correction_complete !== true ||
      restoration.readiness.timing_correction_complete !== true;
  });

  return {
    success: true,
    contract: CONTRACT,
    plan,
    original_source_task_id: originalTask.id,
    restored_source_task_id: restoredTask.id,
    finish_task_id: completed.id,
    local_restoration_complete: restoration.readiness.local_mic_restoration_complete === true,
    local_finishing_complete: true,
    full_auto_studio_complete: remainingBlockers.length === 0,
    elite_studio_blockers: remainingBlockers,
    vocal_engineering: {
      contract: restoration.contract,
      engineering: restoration.engineering,
      analysis: restoration.analysis,
      readiness: restoration.readiness,
      restored_source: restoration.restored,
    },
    output: publicOutput(completed.output),
    execution: {
      runtime: "AVANTIQO_MUSIC_LOCAL_RESTORATION_PLUS_AUDIO_FINISHING",
      local_execution: true,
      runpod_used: false,
      provider_job_submitted: false,
      endpoint_mutation_performed: false,
      direct_workers_max_write: false,
      safe_lease_required_for_this_execution: false,
    },
  };
}

export const CreativeMusicAutoStudioExecutionRuntime = {
  contract: CONTRACT,
  executeLocal: executeMusicAutoStudioLocal,
};
