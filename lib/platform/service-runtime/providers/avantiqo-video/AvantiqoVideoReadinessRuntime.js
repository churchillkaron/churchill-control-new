import { AvantiqoVideoLocalQueueProvider } from "./AvantiqoVideoLocalQueueProvider.js";

export const AVANTIQO_VIDEO_READINESS_CONTRACT = "AVANTIQO_VIDEO_LOCAL_READINESS_V2";

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

export async function getAvantiqoVideoReadiness() {
  const localComputeConfigured = enabled(process.env.AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED);
  let localNodeAvailable = false;
  let availabilityError = null;

  if (localComputeConfigured) {
    try {
      localNodeAvailable = await AvantiqoVideoLocalQueueProvider.available();
    } catch (error) {
      availabilityError = error?.message || String(error);
    }
  }

  const ready = localComputeConfigured && localNodeAvailable;
  return {
    success: ready,
    ready,
    contract: AVANTIQO_VIDEO_READINESS_CONTRACT,
    infrastructure_provider: "AVANTIQO_LOCAL_NODE_V1",
    local_only: true,
    modal_fallback_allowed: false,
    local_compute_configured: localComputeConfigured,
    local_video_worker_implemented: true,
    local_video_node_available: localNodeAvailable,
    generation_spawned: false,
    paid_inference_performed: false,
    status: ready
      ? "READY"
      : localComputeConfigured
        ? "LOCAL_VIDEO_NODE_UNAVAILABLE"
        : "LOCAL_COMPUTE_QUEUE_NOT_CONFIGURED",
    error: ready
      ? null
      : availabilityError ||
        (localComputeConfigured
          ? "AVANTIQO_VIDEO_LOCAL_NODE_UNAVAILABLE"
          : "AVANTIQO_LOCAL_COMPUTE_QUEUE_NOT_CONFIGURED"),
  };
}

export async function inspectAvantiqoVideoRuntimeReadiness() {
  return getAvantiqoVideoReadiness();
}

export const AvantiqoVideoReadinessRuntime = Object.freeze({
  contract: AVANTIQO_VIDEO_READINESS_CONTRACT,
  get: getAvantiqoVideoReadiness,
  inspect: inspectAvantiqoVideoRuntimeReadiness,
});

export default AvantiqoVideoReadinessRuntime;
