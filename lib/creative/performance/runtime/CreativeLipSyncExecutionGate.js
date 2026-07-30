import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

const FLAG = Symbol.for("avantiqo.creative.lipsync-gate.v1");
const list = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const text = (value) => String(value ?? "").trim();
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

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

async function bindLipSync(task = {}) {
  const dependencies = await dependencyTasks(task);
  const motion = dependencies.find((item) =>
    item.metadata?.contract === "PERFORMANCE_MOTION_PLATE_V1",
  );
  if (!motion || motion.status !== "COMPLETED") {
    throw new Error("LIPSYNC_MOTION_PLATE_NOT_COMPLETED");
  }
  const video = outputUrl(motion.output);
  if (!video) throw new Error("LIPSYNC_MOTION_PLATE_URL_REQUIRED");
  const range = audioRange(task, motion);
  const input = parameters(task);
  return ProductionTaskRuntime.update(task.id, {
    input: {
      ...object(task.input),
      video,
      video_source: video,
      audio: { asset_id: range.assetId },
      audio_source: { asset_id: range.assetId },
      audio_start_seconds: range.start,
      audio_end_seconds: range.end,
      identity_profile_id: input.identity_profile_id || null,
      identity_atlas_url: input.identity_atlas_url || null,
      preserve_identity: true,
      preserve_camera_motion: true,
      preserve_body_motion: true,
    },
    metadata: {
      ...object(task.metadata),
      motion_plate_task_id: motion.id,
      motion_plate_url_bound: true,
      primary_audio_asset_id: range.assetId,
      audio_start_seconds: range.start,
      audio_end_seconds: range.end,
      audio_conditioned: true,
    },
  });
}

async function bindValidation(task = {}) {
  const dependencies = await dependencyTasks(task);
  const synced = dependencies.find((item) =>
    item.metadata?.contract === "AUDIO_CONDITIONED_LIPSYNC_V1",
  );
  if (!synced || synced.status !== "COMPLETED") {
    throw new Error("LIPSYNC_OUTPUT_NOT_COMPLETED");
  }
  const video = outputUrl(synced.output);
  if (!video) throw new Error("LIPSYNC_OUTPUT_URL_REQUIRED");
  const range = audioRange(task, synced);
  const input = parameters(task);
  return ProductionTaskRuntime.update(task.id, {
    input: {
      ...object(task.input),
      video,
      video_source: video,
      audio: { asset_id: range.assetId },
      audio_source: { asset_id: range.assetId },
      audio_start_seconds: range.start,
      audio_end_seconds: range.end,
      identity_profile_id: input.identity_profile_id || synced.input?.identity_profile_id || null,
      identity_atlas_url: input.identity_atlas_url || synced.input?.identity_atlas_url || null,
      minimum_sync_score: Number(input.minimum_sync_score || 88),
      minimum_identity_score: Number(input.minimum_identity_score || 90),
      minimum_performance_score: Number(input.minimum_performance_score || 82),
    },
    metadata: {
      ...object(task.metadata),
      lip_sync_task_id: synced.id,
      lip_sync_video_url_bound: true,
      primary_audio_asset_id: range.assetId,
      audio_start_seconds: range.start,
      audio_end_seconds: range.end,
    },
  });
}

function evidence(task = {}) {
  const value = outputValue(task.output);
  return object(value.result || value.validation || value);
}

function validationPassed(task = {}) {
  const value = evidence(task);
  const sync = finite(value.sync_score ?? value.syncScore);
  const identity = finite(value.identity_score ?? value.identityScore);
  const performance = finite(value.performance_score ?? value.performanceScore);
  return value.passed === true &&
    sync !== null && sync >= Number(task.input?.minimum_sync_score || 88) &&
    identity !== null && identity >= Number(task.input?.minimum_identity_score || 90) &&
    performance !== null && performance >= Number(task.input?.minimum_performance_score || 82) &&
    value.mouth_visible !== false && value.audio_conditioned !== false;
}

async function holdForReview(task = {}) {
  if (task.status !== "COMPLETED") return task;
  if (!validationPassed(task)) {
    return ProductionTaskRuntime.fail(task.id, new Error("AUDIO_CONDITIONED_LIPSYNC_VALIDATION_FAILED"), {
      validation_evidence: evidence(task),
    });
  }
  return ProductionTaskRuntime.update(task.id, {
    status: "REVIEW",
    review: { ...object(task.review), required: true, approved: false },
    metadata: {
      ...object(task.metadata),
      automated_lipsync_validation_passed: true,
      downstream_blocked_until_human_approval: true,
    },
  });
}

if (!ProductionTaskRuntime[FLAG]) {
  const dispatch = ProductionTaskRuntime.dispatch.bind(ProductionTaskRuntime);
  Object.defineProperty(ProductionTaskRuntime, FLAG, { value: true });
  ProductionTaskRuntime.dispatch = async function dispatchWithLipSyncGate(id) {
    let task = await ProductionTaskRuntime.get(id);
    if (!task) throw new Error("Production task not found");
    const contract = text(task.metadata?.contract);
    if (contract === "AUDIO_CONDITIONED_LIPSYNC_V1") task = await bindLipSync(task);
    if (contract === "AUDIO_CONDITIONED_LIPSYNC_VALIDATION_V1") task = await bindValidation(task);
    const result = await dispatch(task.id);
    return contract === "AUDIO_CONDITIONED_LIPSYNC_VALIDATION_V1"
      ? holdForReview(result)
      : result;
  };
}

export const CreativeLipSyncExecutionGate = {
  installed: true,
  outputUrl,
  validationPassed,
};
