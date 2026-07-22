import { createHash } from "node:crypto";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formatUuid(bytes) {
  const hex = Buffer.from(bytes).toString("hex");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export function deterministicUuid(value) {
  const source = String(value || "").trim();

  if (!source) {
    throw new Error("DETERMINISTIC_UUID_SOURCE_REQUIRED");
  }

  if (UUID_PATTERN.test(source)) {
    return source.toLowerCase();
  }

  const bytes = createHash("sha256")
    .update(source)
    .digest()
    .subarray(0, 16);

  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return formatUuid(bytes);
}

export function productionTaskId({
  organization_id,
  creative_project_id,
  execution_plan_id,
  step_id,
} = {}) {
  if (!organization_id) {
    throw new Error("organization_id required");
  }

  if (!creative_project_id) {
    throw new Error("creative_project_id required");
  }

  if (!execution_plan_id) {
    throw new Error("execution_plan_id required");
  }

  if (!step_id) {
    throw new Error("execution step id required");
  }

  return deterministicUuid([
    "AVANTIQO_PRODUCTION_TASK_V1",
    organization_id,
    creative_project_id,
    execution_plan_id,
    step_id,
  ].join(":"));
}

export function buildProductionTaskIdentityMap({
  organization_id,
  creative_project_id,
  execution_plan_id,
  steps = [],
} = {}) {
  const identities = new Map();

  for (const step of steps || []) {
    if (!step?.id) {
      throw new Error("EXECUTION_STEP_ID_REQUIRED");
    }

    identities.set(
      step.id,
      productionTaskId({
        organization_id,
        creative_project_id,
        execution_plan_id,
        step_id: step.id,
      }),
    );
  }

  return identities;
}

export function resolveProductionTaskDependencies(
  dependencyStepIds = [],
  identityMap,
) {
  return (dependencyStepIds || []).map((stepId) => {
    const taskId = identityMap?.get(stepId);

    if (!taskId) {
      throw new Error(
        `PRODUCTION_TASK_DEPENDENCY_IDENTITY_MISSING:${stepId}`,
      );
    }

    return taskId;
  });
}
