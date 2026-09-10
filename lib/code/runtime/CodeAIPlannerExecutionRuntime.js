import { createHash } from "node:crypto";

import {
  codeAIInteractivePreviewContext,
} from "./CodeAIInteractivePreviewContextRuntime.js";

const CONTRACT = "AVANTIQO_CODE_AI_PLANNER_EXECUTION_V2";
const OWNED_PROVIDER = "avantiqo-code";
const PLANNER_CAPABILITY = "ai.code.debug";
const LOCAL_REVIEW_SCOPE = "BENCHMARK_REVIEW_PREVIEW";
const BENCHMARK_ESTIMATED_INPUT_TOKENS = 32768;
const BENCHMARK_ESTIMATED_OUTPUT_TOKENS = 4096;
const DEFAULT_POLL_INTERVAL_MS = 1200;
const DEFAULT_POLL_WINDOW_MS = 25000;
const MAX_POLL_WINDOW_MS = 60000;
const CODE_AI_USAGE_ID_CONTRACT = "AVANTIQO_CODE_AI_PLANNER_USAGE_ID_V1";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deterministicPlannerUsageId(executionInput = {}, recoveryCount = 0) {
  const metadata = object(executionInput.metadata);
  const missionId = text(metadata.code_ai_mission_id);
  const iteration = Math.trunc(number(metadata.code_ai_iteration, 0));
  if (!missionId || iteration <= 0) return null;

  const digest = createHash("sha256")
    .update(
      CODE_AI_USAGE_ID_CONTRACT + ":" + missionId + ":" + iteration + ":recovery:" +
      Math.max(0, Math.trunc(number(recoveryCount, 0))),
    )
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

async function responseJson(response) {
  return response.json().catch(() => ({}));
}

async function defaultServiceRuntime() {
  const runtime = await import(
    "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime"
  );
  return runtime.ServiceExecutionRuntime;
}

function localDevelopmentOwnedReviewPolicy(raw = {}) {
  const localDevelopment = text(process.env.NODE_ENV).toLowerCase() === "development";
  const interactivePreview = codeAIInteractivePreviewContext();
  if (!localDevelopment && interactivePreview?.authorized !== true) return {};
  const capability = text(raw.capability || raw?.input?.capability);
  if (capability !== PLANNER_CAPABILITY) return {};
  return {
    provider_id: OWNED_PROVIDER,
    provider_policy: {
      ...object(raw.provider_policy),
      allowed_providers: [OWNED_PROVIDER],
      execution_scope: LOCAL_REVIEW_SCOPE,
      benchmark_only: true,
      owned_only_required: true,
      external_fallback_allowed: false,
      benchmark_pricing_estimate: {
        input_tokens: BENCHMARK_ESTIMATED_INPUT_TOKENS,
        output_tokens: BENCHMARK_ESTIMATED_OUTPUT_TOKENS,
      },
    },
    metadata: {
      ...object(raw.metadata),
      execution_scope: LOCAL_REVIEW_SCOPE,
      benchmark_only: true,
      production_certified: false,
      local_development_owned_code_preview: localDevelopment,
      code_studio_interactive_preview: interactivePreview?.authorized === true,
      code_studio_preview_source: interactivePreview?.source || null,
      code_studio_preview_execution_key: interactivePreview?.execution_key || null,
      pricing_estimate_max_input_tokens: BENCHMARK_ESTIMATED_INPUT_TOKENS,
      pricing_estimate_max_output_tokens: BENCHMARK_ESTIMATED_OUTPUT_TOKENS,
    },
  };
}

function normalizedExecutionInput(value) {
  const raw = object(value);
  const input = object(raw.input);
  const instructions = text(input.instructions || input.instruction);
  const preview = localDevelopmentOwnedReviewPolicy(raw);
  const normalized = {
    ...raw,
    ...preview,
    input: {
      ...input,
      ...(instructions ? { instructions } : {}),
    },
  };
  const usageId = deterministicPlannerUsageId(normalized, 0);
  return usageId
    ? {
        ...normalized,
        metadata: {
          ...object(normalized.metadata),
          code_ai_usage_id_contract: CODE_AI_USAGE_ID_CONTRACT,
          code_ai_usage_id: usageId,
        },
      }
    : normalized;
}

function localCodePlannerReview(executionInput = {}) {
  const metadata = object(executionInput?.metadata);
  return Boolean(
    text(executionInput.provider_id) === OWNED_PROVIDER &&
    text(executionInput.capability || executionInput?.input?.capability) === PLANNER_CAPABILITY &&
    text(metadata.execution_scope) === LOCAL_REVIEW_SCOPE &&
    metadata.benchmark_only === true &&
    (
      metadata.local_development_owned_code_preview === true ||
      metadata.code_studio_interactive_preview === true
    )
  );
}

async function assertLocalCodeEndpointAcceptingWork(executionInput = {}) {
  if (!localCodePlannerReview(executionInput)) return null;
  return {
    transport: "MODAL_SERVICE_RUNTIME",
    accepting_work: true,
    serverless_endpoint_required: false,
    provider_control_plane_read_performed: false,
    checked_at: new Date().toISOString(),
  };
}
function pendingDescriptor(result = {}, executionInput = {}, recovery = {}) {
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
    provider_endpoint_id: text(executionInput?.metadata?.provider_endpoint_id) || null,
    usage_id: usageId,
    pricing: object(result.pricing),
    quantity: number(executionInput?.input?.quantity, 1),
    unit: text(result?.usage?.unit) || "request",
    metadata: object(executionInput.metadata),
    credential_id: text(result.credential_id) || null,
    started_at: text(result.started_at) || new Date().toISOString(),
    model: text(result.model) || null,
    stale_queue_recovery_count: Math.max(0, number(recovery.stale_queue_recovery_count, 0)),
    recovered_from_provider_job_id: text(recovery.recovered_from_provider_job_id) || null,
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
  return {
    ...pending,
    stale_queue_recovery_count: Math.max(0, number(pending.stale_queue_recovery_count, 0)),
    recovered_from_provider_job_id: text(pending.recovered_from_provider_job_id) || null,
  };
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

async function recoverStaleQueuedPlannerExecution() {
  // Modal lifecycle and cancellation are provider-owned. The planner only polls
  // through governed Service Runtime and never reaches into provider queues.
  return null;
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
  service_runtime = null,
} = {}) {
  let executionInput = normalizedExecutionInput(execution_input);
  const organizationId = text(executionInput.organization_id || pending_execution?.organization_id);
  if (!organizationId) throw new Error("CODE_AI_PLANNER_ORGANIZATION_REQUIRED");

  const serviceRuntime = service_runtime || await defaultServiceRuntime();
  if (!serviceRuntime || typeof serviceRuntime.execute !== "function" || typeof serviceRuntime.settle !== "function") {
    throw new Error("CODE_AI_PLANNER_SERVICE_RUNTIME_INVALID");
  }

  let result;
  let pending;
  if (pending_execution) {
    pending = assertPendingDescriptor(pending_execution, organizationId);
    result = { pending: true };
  } else {
    const endpointPreflight = await assertLocalCodeEndpointAcceptingWork(executionInput);
    if (endpointPreflight) {
      executionInput = {
        ...executionInput,
        metadata: {
          ...object(executionInput.metadata),
          code_endpoint_preflight: endpointPreflight,
        },
      };
    }
    result = await serviceRuntime.execute(executionInput);
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
    result = await settleOnce(serviceRuntime, pending);
    if (result?.failed || result?.success === false) {
      throw new Error(text(result?.error) || "CODE_AI_PLANNER_PROVIDER_EXECUTION_FAILED");
    }
    if (result?.pending) continue;
    const output = plannerResultText(result);
    if (!output) throw new Error("CODE_AI_PLANNER_COMPLETED_OUTPUT_REQUIRED");
    return { success: true, pending: false, result, output, pending_execution: null };
  }

  const staleRecovery = await recoverStaleQueuedPlannerExecution({
    serviceRuntime,
    pending,
    executionInput,
    result,
  });
  if (staleRecovery) return staleRecovery;

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
