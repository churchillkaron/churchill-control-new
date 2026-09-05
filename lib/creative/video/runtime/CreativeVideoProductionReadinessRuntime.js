import {
  loadProviderRuntime,
} from "@/lib/platform/service-runtime/providers/ProviderExecutor";

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

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function executableTasks(queue = {}) {
  return [
    ...(Array.isArray(queue.ready) ? queue.ready : []),
    ...(Array.isArray(queue.waiting) ? queue.waiting : []),
    ...(Array.isArray(queue.running) ? queue.running : []),
  ];
}

function baseEvidence({ masteredTasks = [], otherVideoTasks = [] } = {}) {
  return {
    contract: CONTRACT,
    provider: OWNED_PROVIDER,
    scope: "MASTERED_VIDEO_GENERATION",
    task_count: masteredTasks.length,
    capabilities: unique(masteredTasks.map(capability)),
    other_video_capabilities: unique(otherVideoTasks.map(capability)),
    generation_spawned: false,
    paid_inference_performed: false,
    checked_at: new Date().toISOString(),
  };
}

export const CreativeVideoProductionReadinessRuntime = {
  async inspect({ queue = {} } = {}) {
    const videoTasks = executableTasks(queue).filter((task) =>
      capability(task).startsWith("ai.video."),
    );
    const masteredTasks = videoTasks.filter((task) =>
      MASTERED_CAPABILITIES.has(capability(task)),
    );
    const otherVideoTasks = videoTasks.filter((task) =>
      !MASTERED_CAPABILITIES.has(capability(task)),
    );
    const evidence = baseEvidence({ masteredTasks, otherVideoTasks });

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

    try {
      const providerRuntime = await loadProviderRuntime(OWNED_PROVIDER);
      if (typeof providerRuntime?.readiness !== "function") {
        throw new Error("AVANTIQO_VIDEO_READINESS_RUNTIME_REQUIRED");
      }
      const provider = await providerRuntime.readiness({
        capabilities: evidence.capabilities,
      });
      const ready = provider?.ready === true;
      return {
        ...evidence,
        required: true,
        ready,
        status: ready ? (provider.status || "READY") : "BLOCKED",
        detail: ready
          ? "Avantiqo Cinema control plane is reachable. No generation was spawned by this check."
          : "Avantiqo Cinema is not ready for governed Studio generation.",
        provider_readiness: provider || null,
        error: ready ? null : provider?.error || "AVANTIQO_VIDEO_RUNTIME_NOT_READY",
      };
    } catch (error) {
      return {
        ...evidence,
        required: true,
        ready: false,
        status: "BLOCKED",
        detail: "Avantiqo Cinema readiness could not be proven without starting generation.",
        provider_readiness: null,
        error: error?.message || String(error),
      };
    }
  },
};

export const CREATIVE_VIDEO_PRODUCTION_READINESS_CONTRACT = CONTRACT;
export const CREATIVE_VIDEO_MASTERED_CAPABILITIES = MASTERED_CAPABILITIES;
