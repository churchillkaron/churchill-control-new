import { createHash } from "node:crypto";

export const AVANTIQO_LOCAL_COMPUTE_ENQUEUE_CONTRACT =
  "AVANTIQO_LOCAL_COMPUTE_ENQUEUE_V2";

function text(value) {
  return String(value ?? "").trim();
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stable(value[key])]),
  );
}

function digest(value) {
  return createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
}

export function localComputeExecutionKey({
  usage_id,
  capability,
  input = {},
} = {}) {
  const explicit = text(
    input.execution_idempotency_key ||
      input.request_idempotency_key ||
      input.execution_key ||
      input.idempotency_key ||
      input.metadata?.provider_execution_key ||
      input.metadata?.execution_key,
  );
  if (explicit) return explicit;

  const usage = text(usage_id);
  const cap = text(capability);
  const hierarchicalStage = text(
    input.hierarchical_stage ||
      input.hierarchicalStage ||
      input.metadata?.hierarchical_stage ||
      input.metadata?.hierarchicalStage,
  );
  if (!usage || !cap) return null;
  return hierarchicalStage
    ? `local-compute:${usage}:${cap}:hierarchical:${hierarchicalStage}`
    : `local-compute:${usage}:${cap}`;
}

export function localComputeRequestHash({
  capability,
  lane,
  workload,
  model,
  payload,
} = {}) {
  return digest({
    contract: AVANTIQO_LOCAL_COMPUTE_ENQUEUE_CONTRACT,
    capability: text(capability),
    lane: text(lane) || "utility",
    workload: text(workload),
    model: text(model) || null,
    payload: payload || {},
  });
}
