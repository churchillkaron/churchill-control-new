import {
  resolveServiceCapabilities,
} from "@/lib/platform/service-runtime/services/resolver/ServiceCapabilityResolver";

const SERVICE_BY_TASK_TYPE = Object.freeze({
  GENERATE_IMAGE: "ai.image.generate",
  GENERATE_VIDEO: "ai.video.generate",
  IMAGE_TO_VIDEO: "ai.video.image_to_video",
  GENERATE_VOICE: "ai.text.to.speech",
  GENERATE_MUSIC: "ai.music.generate",
  GENERATE_SFX: "ai.sfx.generate",
  LIP_SYNC: "ai.video.lipsync",
  UPSCALE: "ai.image.upscale",
  SUBTITLE: "ai.speech.to.text",
  QUALITY_REVIEW: "ai.reasoning.execute",
});

function text(value) {
  return String(value ?? "").trim();
}

function assertExecutableService(serviceId, task = {}) {
  const resolved = resolveServiceCapabilities(serviceId);
  if (!resolved?.service_id || !Array.isArray(resolved.capabilities) || !resolved.capabilities.length) {
    throw new Error(
      `CREATIVE_TASK_SERVICE_UNAVAILABLE:${serviceId}:${text(task.type) || "UNKNOWN"}`,
    );
  }

  const requestedCapability = text(task.capability);
  if (
    requestedCapability &&
    requestedCapability !== serviceId &&
    !resolved.capabilities.includes(requestedCapability)
  ) {
    throw new Error(
      `CREATIVE_TASK_CAPABILITY_UNAVAILABLE:${serviceId}:${requestedCapability}`,
    );
  }

  return serviceId;
}

export function resolveCreativeService(task = {}) {
  const explicit = text(task.service_id || task.service_code) || null;
  if (explicit) return assertExecutableService(explicit, task);

  const mapped = SERVICE_BY_TASK_TYPE[text(task.type).toUpperCase()] || null;
  if (!mapped) {
    throw new Error(`CREATIVE_TASK_SERVICE_UNRESOLVED:${task.type || "UNKNOWN"}`);
  }

  return assertExecutableService(mapped, task);
}
