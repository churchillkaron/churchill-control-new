import "@/lib/platform/service-runtime/execution/ServicePendingPollResilienceRuntime";
import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_POLL_MS = 750;
const MAX_TIMEOUT_MS = 300_000;

function text(value) {
  return String(value ?? "").trim();
}

function boundedNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function completionTimeoutMs(value) {
  return boundedNumber(
    value ?? process.env.AVANTIQO_SERVICE_COMPLETION_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
    5_000,
    MAX_TIMEOUT_MS,
  );
}

function completionPollMs(value) {
  return boundedNumber(
    value ?? process.env.AVANTIQO_SERVICE_COMPLETION_POLL_MS,
    DEFAULT_POLL_MS,
    250,
    5_000,
  );
}

function completedExecution(initial, settled) {
  const providerResult = settled?.output?.raw || settled?.output || null;
  return {
    ...initial,
    ...settled,
    provider: settled?.provider || initial?.provider || null,
    model:
      settled?.model ||
      providerResult?.output?.model ||
      providerResult?.model ||
      initial?.model ||
      null,
    pricing: settled?.pricing || initial?.pricing || null,
    reservation_pricing:
      settled?.reservation_pricing || initial?.reservation_pricing || initial?.pricing || null,
    usage: settled?.usage || initial?.usage || null,
    billing: settled?.billing || initial?.billing || null,
    credential_id: initial?.credential_id || null,
    started_at: initial?.started_at || null,
    pending: false,
    output: providerResult || settled?.output || initial?.output || null,
  };
}

export async function awaitServiceExecutionCompletion({
  execution,
  organization_id,
  capability = null,
  metadata = {},
  timeout_ms = null,
  poll_ms = null,
} = {}) {
  if (!execution?.pending) return execution;

  const provider = text(execution.provider);
  const providerJobId = text(execution.provider_job_id);
  const usageId = text(execution.usage?.id);
  if (!organization_id || !provider || !providerJobId || !usageId) {
    throw new Error("SERVICE_PENDING_EXECUTION_COMPLETION_INPUT_INVALID");
  }
  const deadline = Date.now() + completionTimeoutMs(timeout_ms);
  const pollMs = completionPollMs(poll_ms);
  let settled = execution;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    settled = await ServiceExecutionRuntime.settle({
      organization_id,
      provider,
      provider_job_id: providerJobId,
      usage_id: usageId,
      pricing: execution.pricing || {},
      quantity: execution.usage?.quantity ?? null,
      unit: execution.usage?.unit ?? null,
      metadata,
      provider_status_input: capability ? { capability } : {},
      credential_id: execution.credential_id || null,
      started_at: execution.started_at || null,
    });

    if (settled?.failed || settled?.success === false) {
      throw new Error(text(settled?.error) || "SERVICE_PENDING_EXECUTION_FAILED");
    }
    if (!settled?.pending) return completedExecution(execution, settled);
  }

  throw new Error("SERVICE_PENDING_EXECUTION_COMPLETION_TIMEOUT");
}

export const ServiceExecutionCompletionRuntime = Object.freeze({
  contract: "SERVICE_EXECUTION_COMPLETION_V1",
  await: awaitServiceExecutionCompletion,
});

export default awaitServiceExecutionCompletion;
