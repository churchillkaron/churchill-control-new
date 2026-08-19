import {
  resolveServiceCapabilities,
} from "@/lib/platform/service-runtime/services/resolver/ServiceCapabilityResolver";

const VIDEO_EXECUTION_APPROVAL_CONTRACT =
  "CREATIVE_SINGLE_MEDIA_EXECUTION_APPROVAL_V1";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function isVideoGenerationTask(task = {}, resolved = {}) {
  const type = text(task.type).toUpperCase();
  const requestedCapability = text(
    task.capability || task.service_code,
  ).toLowerCase();
  const capabilities = Array.isArray(resolved.capabilities)
    ? resolved.capabilities.map((capability) => text(capability).toLowerCase())
    : [];

  return (
    type === "GENERATE_VIDEO" ||
    requestedCapability.includes("video.generate") ||
    capabilities.some((capability) => capability.includes("video.generate"))
  );
}

function assertExplicitVideoDispatch(task = {}, resolved = {}) {
  if (!isVideoGenerationTask(task, resolved)) return;

  const authorization = object(
    task.metadata?.media_generation_authorization,
  );
  const taskWorkerId = text(task.worker_id);
  const metadataWorkerId = text(task.metadata?.dispatch_worker_id);

  if (
    authorization.contract !== VIDEO_EXECUTION_APPROVAL_CONTRACT ||
    authorization.media_generation_authorized !== true ||
    authorization.publication_authorized !== false ||
    authorization.consumed !== true ||
    !text(authorization.consumed_at)
  ) {
    throw new Error("CREATIVE_VIDEO_EXPLICIT_DISPATCH_REQUIRED");
  }

  if (
    text(authorization.task_id) !== text(task.id) ||
    text(authorization.organization_id) !== text(task.organization_id) ||
    text(authorization.creative_project_id) !== text(task.creative_project_id) ||
    text(authorization.production_graph_id) !== text(task.production_graph_id)
  ) {
    throw new Error("CREATIVE_VIDEO_DISPATCH_AUTHORIZATION_SCOPE_MISMATCH");
  }

  if (
    !taskWorkerId.startsWith("creative-video-dispatch:") ||
    metadataWorkerId !== taskWorkerId
  ) {
    throw new Error("CREATIVE_VIDEO_GOVERNED_WORKER_REQUIRED");
  }
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

  assertExplicitVideoDispatch(task, resolved);
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
