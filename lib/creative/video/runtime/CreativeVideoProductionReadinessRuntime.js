import {
  inspectAvantiqoVideoRuntimeReadiness,
} from "@/lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoReadinessRuntime";

const CONTRACT = "CREATIVE_VIDEO_PRODUCTION_READINESS_V1";
const OWNED_PROVIDER = "avantiqo-video";
const MASTERED_CAPABILITIES = new Set([
  "ai.video.generate",
  "ai.video.image_to_video",
  "ai.video.first_last_frame_to_video",
]);

function text(value) {
  return String(value ?? "").trim();
}

function capability(task = {}) {
  return text(task.capability || task.service_code).toLowerCase();
}

function isMasteredVideoTask(task = {}) {
  return MASTERED_CAPABILITIES.has(capability(task));
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function tasks(queue = {}, key) {
  return Array.isArray(queue?.[key]) ? queue[key] : [];
}

function baseEvidence({ masteredTasks = [], otherVideoTasks = [], runningMasteredTasks = [], pendingMasteredTasks = [] } = {}) {
  return {
    contract: CONTRACT,
    provider: OWNED_PROVIDER,
    scope: "MASTERED_VIDEO_GENERATION",
    task_count: masteredTasks.length,
    running_task_count: runningMasteredTasks.length,
    pending_task_count: pendingMasteredTasks.length,
    capabilities: unique(masteredTasks.map(capability)),
    other_video_capabilities: unique(otherVideoTasks.map(capability)),
    generation_spawned: false,
    paid_inference_performed: false,
    checked_at: new Date().toISOString(),
  };
}

export const CreativeVideoProductionReadinessRuntime = {
  async inspect({ queue = {} } = {}) {
    const pendingTasks = [...tasks(queue, "ready"), ...tasks(queue, "waiting")];
    const runningTasks = tasks(queue, "running");
    const activeTasks = [...pendingTasks, ...runningTasks];
    const videoTasks = activeTasks.filter((task) => capability(task).startsWith("ai.video."));
    const masteredTasks = videoTasks.filter(isMasteredVideoTask);
    const runningMasteredTasks = runningTasks.filter(isMasteredVideoTask);
    const pendingMasteredTasks = pendingTasks.filter(isMasteredVideoTask);
    const otherVideoTasks = videoTasks.filter((task) => !isMasteredVideoTask(task));
    const evidence = baseEvidence({
      masteredTasks,
      otherVideoTasks,
      runningMasteredTasks,
      pendingMasteredTasks,
    });

    if (!masteredTasks.length) {
      return {
        ...evidence,
        required: false,
        ready: true,
        status: "NOT_REQUIRED",
        detail: videoTasks.length
          ? "No mastered Avantiqo Cinema generation task is executable in this pass."
          : "No executable video generation task is present in this production pass.",
      };
    }

    const provider = await inspectAvantiqoVideoRuntimeReadiness();
    const ready = provider?.ready === true;
    const status = text(provider?.status).toUpperCase() || (ready ? "READY" : "BLOCKED");

    return {
      ...evidence,
      required: pendingMasteredTasks.length > 0,
      ready,
      status,
      detail: ready
        ? "Avantiqo Cinema control plane is reachable and idle. No generation was spawned by this check."
        : status === "BUSY" && runningMasteredTasks.length > 0
          ? "This project has native Video work in flight. Studio can safely check its provider state without starting another generation."
          : status === "BUSY"
            ? "Avantiqo Cinema is healthy but occupied by other work. Studio will not pile another native generation onto the lane."
            : "Avantiqo Cinema readiness could not be proven without starting generation.",
      provider_readiness: provider || null,
      error: ready ? null : provider?.error || "AVANTIQO_VIDEO_RUNTIME_NOT_READY",
    };
  },
};

export const CREATIVE_VIDEO_PRODUCTION_READINESS_CONTRACT = CONTRACT;
export const CREATIVE_VIDEO_MASTERED_CAPABILITIES = MASTERED_CAPABILITIES;