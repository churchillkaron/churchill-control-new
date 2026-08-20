import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  CreativeProductionTaskReviewSettlementGate,
} from "@/lib/creative/production/review/runtime/CreativeProductionTaskReviewSettlementGate";

const FLAG = Symbol.for("avantiqo.creative.lipsync-gate.v2");
const list = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const text = (value) => String(value ?? "").trim();
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

const LIPSYNC_CONTRACTS = new Set([
  "AUDIO_CONDITIONED_LIPSYNC_V1",
  "AUDIO_CONDITIONED_LIPSYNC_V2",
]);

const VALIDATION_CONTRACTS = new Set([
  "AUDIO_CONDITIONED_LIPSYNC_VALIDATION_V1",
  "AUDIO_CONDITIONED_LIPSYNC_VALIDATION_V2",
]);

function outputValue(output = {}) {
  return output?.output?.output || output?.output || output || {};
}

function outputUrl(output = {}) {
  const value = outputValue(output);
  return value.video_url || value.videoUrl || value.file_url || value.fileUrl ||
    value.url || value.result?.url || (typeof value.result === "string" ? value.result : null) || null;
}

async function dependencyTasks(task = {}) {
  const result = [];
  for (const id of list(task.depends_on)) {
    const dependency = await ProductionTaskRuntime.get(id);
    if (dependency) result.push(dependency);
  }
  return result;
}

function parameters(task = {}) {
  return {
    ...object(task.input?.generation?.provider_parameters),
    ...object(task.input?.provider_parameters),
  };
}

function audioRange(task = {}, source = {}) {
  const input = parameters(task);
  const assetId = text(
    input.primary_audio_asset_id ||
    task.input?.requirements?.primary_audio_asset_id ||
    source.metadata?.primary_audio_asset_id,
  );
  const start = finite(
    input.audio_start_seconds ??
    task.input?.requirements?.audio_start_seconds ??
    source.metadata?.audio_start_seconds,
  );
  const end = finite(
    input.audio_end_seconds ??
    task.input?.requirements?.audio_end_seconds ??
    source.metadata?.audio_end_seconds,
  );
  if (!assetId) throw new Error("LIPSYNC_PRIMARY_AUDIO_ASSET_REQUIRED");
  if (start === null || end === null || end <= start) {
    throw new Error("LIPSYNC_AUDIO_RANGE_INVALID");
  }
  return { assetId, start, end };
}

function validationThreshold(task = {}, input = {}, key, fallback) {
  return Number(
    input[key] ||
    task.input?.requirements?.[key] ||
    task.metadata?.[key] ||
    fallback,
  );
}

async function bindLipSync(task = {}) {
  const dependencies = await dependencyTasks(task);
  const motion = dependencies.find((item) =>
    ["PERFORMANCE_MOTION_PLATE_V1", "PERFORMANCE_MOTION_PLATE_V2"]
      .includes(item.metadata?.contract),
  );
  if (!motion || motion.status !== "COMPLETED") {
    throw new Error("LIPSYNC_MOTION_PLATE_NOT_COMPLETED");
  }
  const video = outputUrl(motion.output);
  if (!video) throw new Error("LIPSYNC_MOTION_PLATE_URL_REQUIRED");
  const range = audioRange(task, motion);
  const input = parameters(task);
  const mode = text(
    input.vocal_performance_mode ||
    task.input?.requirements?.vocal_performance_mode ||
    task.metadata?.vocal_performance_mode,
  ) || "VOCAL_PERFORMANCE";

  return ProductionTaskRuntime.update(task.id, {
    input: {
      ...object(task.input),
      video,
      video_source: video,
      audio: { asset_id: range.assetId },
      audio_source: { asset_id: range.assetId },
      audio_start_seconds: range.start,
      audio_end_seconds: range.end,
      vocal_performance_mode: mode,
      identity_profile_id: input.identity_profile_id || null,
      identity_atlas_url: input.identity_atlas_url || null,
      preserve_identity: true,
      preserve_head_pose: true,
      preserve_camera_motion: true,
      preserve_body_motion: true,
      preserve_source_audio: true,
      mouth_visibility_required: true,
      natural_face_motion_required: true,
    },
    metadata: {
      ...object(task.metadata),
      motion_plate_task_id: motion.id,
      motion_plate_url_bound: true,
      primary_audio_asset_id: range.assetId,
      audio_start_seconds: range.start,
      audio_end_seconds: range.end,
      vocal_performance_mode: mode,
      audio_conditioned: true,
      exact_audio_window_bound: true,
    },
  });
}

async function bindValidation(task = {}) {
  const dependencies = await dependencyTasks(task);
  const synced = dependencies.find((item) =>
    LIPSYNC_CONTRACTS.has(item.metadata?.contract),
  );
  if (!synced || synced.status !== "COMPLETED") {
    throw new Error("LIPSYNC_OUTPUT_NOT_COMPLETED");
  }
  const video = outputUrl(synced.output);
  if (!video) throw new Error("LIPSYNC_OUTPUT_URL_REQUIRED");
  const range = audioRange(task, synced);
  const input = parameters(task);
  const mode = text(
    input.vocal_performance_mode ||
    task.input?.requirements?.vocal_performance_mode ||
    task.metadata?.vocal_performance_mode ||
    synced.metadata?.vocal_performance_mode,
  ) || "VOCAL_PERFORMANCE";

  const minimumSync = validationThreshold(
    task,
    input,
    "minimum_sync_score",
    88,
  );
  const minimumIdentity = validationThreshold(
    task,
    input,
    "minimum_identity_score",
    90,
  );
  const minimumPerformance = validationThreshold(
    task,
    input,
    "minimum_performance_score",
    82,
  );

  return ProductionTaskRuntime.update(task.id, {
    input: {
      ...object(task.input),
      video,
      video_source: video,
      audio: { asset_id: range.assetId },
      audio_source: { asset_id: range.assetId },
      audio_start_seconds: range.start,
      audio_end_seconds: range.end,
      vocal_performance_mode: mode,
      identity_profile_id:
        input.identity_profile_id ||
        synced.input?.identity_profile_id ||
        null,
      identity_atlas_url:
        input.identity_atlas_url ||
        synced.input?.identity_atlas_url ||
        null,
      minimum_sync_score: minimumSync,
      minimum_identity_score: minimumIdentity,
      minimum_performance_score: minimumPerformance,
      require_visible_mouth: true,
      require_audio_conditioned_sync: true,
      require_identity_preservation: true,
      require_natural_face_motion: true,
    },
    metadata: {
      ...object(task.metadata),
      lip_sync_task_id: synced.id,
      lip_sync_video_url_bound: true,
      primary_audio_asset_id: range.assetId,
      audio_start_seconds: range.start,
      audio_end_seconds: range.end,
      vocal_performance_mode: mode,
      minimum_sync_score: minimumSync,
      minimum_identity_score: minimumIdentity,
      minimum_performance_score: minimumPerformance,
      exact_audio_window_bound: true,
      downstream_blocked_until_human_approval: true,
    },
  });
}

function evidence(task = {}) {
  return CreativeProductionTaskReviewSettlementGate.nestedEvidence(task.output);
}

function validationPassed(task = {}) {
  return CreativeProductionTaskReviewSettlementGate.lipSyncReviewPassed(task);
}

if (!ProductionTaskRuntime[FLAG]) {
  const dispatch = ProductionTaskRuntime.dispatch.bind(ProductionTaskRuntime);
  Object.defineProperty(ProductionTaskRuntime, FLAG, { value: true });
  ProductionTaskRuntime.dispatch = async function dispatchWithLipSyncGate(id) {
    let task = await ProductionTaskRuntime.get(id);
    if (!task) throw new Error("Production task not found");
    const contract = text(task.metadata?.contract);
    if (LIPSYNC_CONTRACTS.has(contract)) task = await bindLipSync(task);
    if (VALIDATION_CONTRACTS.has(contract)) task = await bindValidation(task);
    return dispatch(task.id);
  };
}

export const CreativeLipSyncExecutionGate = {
  installed: true,
  outputUrl,
  evidence,
  validationPassed,
};