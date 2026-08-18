import {
  resolveServiceCapabilities,
} from "@/lib/platform/service-runtime/services/resolver/ServiceCapabilityResolver";

function text(value) {
  return String(value ?? "").trim();
}

function assertExecutableService(serviceId, task = {}) {
  const resolved = resolveServiceCapabilities(serviceId);
  if (
    !resolved?.service_id ||
    !Array.isArray(resolved.capabilities) ||
    !resolved.capabilities.length
  ) {
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
  const explicit = text(task.service_id || task.service_code);
  if (!explicit) {
    throw new Error(
      `CREATIVE_TASK_EXPLICIT_SERVICE_REQUIRED:${text(task.id) || "UNKNOWN"}:${text(task.type) || "UNKNOWN"}`,
    );
  }

  return assertExecutableService(explicit, task);
}
