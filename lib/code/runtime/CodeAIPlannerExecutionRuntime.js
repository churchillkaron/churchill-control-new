import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const CONTRACT = "AVANTIQO_CODE_AI_PLANNER_EXECUTION_V1";
const DEFAULT_POLL_INTERVAL_MS = 1200;
const DEFAULT_POLL_WINDOW_MS = 25000;
const MAX_POLL_WINDOW_MS = 60000;

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizedExecutionInput(value) {
  const raw = object(value);
  const input = object(raw.input);
  const instructions = text(input.instructions || input.instruction);
  return {
    ...raw,
    input: {
      ...input,
      ...(instructions ? { instructions } : {}),
    },
  };
}

function pendingDescriptor(result = {}, executionInput = {}) {
  const usageId = text(result?.usage?.id);
  const provider = text(result?.provider);
  const providerJobId = text(result?.provider_job_id);
  if (!usageId || !provider || !providerJobId) {
    throw new Error("CODE_AI_PLANNER_PENDING_EVIDENCE_INCOMPLETE");
  }
  return {
    contract: CONTRACT,
    organization_id: text(executionInput.organization_id),
    provider,
    provider_job_id: providerJobId,
    usage_id: usageId,
    pricing: object(result.pricing),
    quantity: number(executionInput?.input?.quantity, 1),
    unit: text(result?.usage?.unit) || "request",
    metadata: object(executionInput.metadata),
    credential_id: text(result.credential_id) || null,
    started_at: text(result.started_at) || new Date().toISOString(),
    model: text(result.model) || null,
  };
}

function assertPendingDescriptor(value, organizationId) {
  const pending = object(value);
  if (text(pending.contract) !== CONTRACT) throw new Error("CODE_AI_PLANNER_PENDING_CONTRACT_INVALID");
  if (!organizationId || text(pending.organization_id) !== organizationId) {
    throw new Error("CODE_AI_PLANNER_PENDING_ORGANIZATION_MISMATCH");
  }
  for (const field of ["provider", "provider_job_id", "usage_id"]) {
    if (!text(pending[field])) throw new Error(`CODE_AI_PLANNER_PENDING_${field.toUpperCase()}_REQUIRED`);
  }
  return pending;
}

async function settleOnce(serviceRuntime, pending) {
  return serviceRuntime.settle({
    organization_id: pending.organization_id,
    provider: pending.provider,
    provider_job_id: pending.provider_job_id,
    usage_id: pending.usage_id,
    pricing: pending.pricing,
    quantity: pending.quantity,
    unit: pending.unit,
    metadata: pending.metadata,
    credential_id: pending.credential_id,
    started_at: pending.started_at,
  });
}

export function plannerResultText(result = {}) {
  return text(
    result?.output?.raw?.output?.result ||
    result?.output?.result ||
    result?.output?.output?.result ||
    result?.usage?.metadata?.provider_result?.output?.result ||
    result?.usage?.metadata?.result?.result ||
    result?.billing?.usage?.metadata?.provider_result?.output?.result ||
    result?.billing?.usage?.metadata?.result?.result,
  );
}

export async function executeCodeAIPlannerRequest({
  execution_input,
  pending_execution = null,
  poll_interval_ms = DEFAULT_POLL_INTERVAL_MS,
  poll_window_ms = DEFAULT_POLL_WINDOW_MS,
  service_runtime = ServiceExecutionRuntime,
} = {}) {
  const executionInput = normalizedExecutionInput(execution_input);
  const organizationId = text(executionInput.organization_id || pending_execution?.organization_id);
  if (!organizationId) throw new Error("CODE_AI_PLANNER_ORGANIZATION_REQUIRED");
  if (!service_runtime || typeof service_runtime.execute !== "function" || typeof service_runtime.settle !== "function") {
    throw new Error("CODE_AI_PLANNER_SERVICE_RUNTIME_INVALID");
  }

  let result;
  let pending;
  if (pending_execution) {
    pending = assertPendingDescriptor(pending_execution, organizationId);
    result = { pending: true };
  } else {
    result = await service_runtime.execute(executionInput);
    if (!result?.success) throw new Error("CODE_AI_PLANNER_EXECUTION_FAILED");
    if (!result?.pending) {
      const output = plannerResultText(result);
      if (!output) throw new Error("CODE_AI_PLANNER_COMPLETED_OUTPUT_REQUIRED");
      return { success: true, pending: false, result, output, pending_execution: null };
    }
    pending = pendingDescriptor(result, executionInput);
  }

  const interval = Math.max(250, Math.min(5000, number(poll_interval_ms, DEFAULT_POLL_INTERVAL_MS)));
  const windowMs = Math.max(1000, Math.min(MAX_POLL_WINDOW_MS, number(poll_window_ms, DEFAULT_POLL_WINDOW_MS)));
  const deadline = Date.now() + windowMs;

  while (Date.now() < deadline) {
    await delay(interval);
    result = await settleOnce(service_runtime, pending);
    if (result?.failed || result?.success === false) {
      throw new Error(text(result?.error) || "CODE_AI_PLANNER_PROVIDER_EXECUTION_FAILED");
    }
    if (result?.pending) continue;
    const output = plannerResultText(result);
    if (!output) throw new Error("CODE_AI_PLANNER_COMPLETED_OUTPUT_REQUIRED");
    return { success: true, pending: false, result, output, pending_execution: null };
  }

  return {
    success: true,
    pending: true,
    result,
    output: null,
    pending_execution: pending,
  };
}

export const CodeAIPlannerExecutionRuntime = Object.freeze({
  contract: CONTRACT,
  execute: executeCodeAIPlannerRequest,
  resultText: plannerResultText,
});
