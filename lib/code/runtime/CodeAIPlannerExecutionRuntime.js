import { createHash } from "node:crypto";

import {
  CODE_AI_PLANNER_STALE_CANCEL_SETTLE_WINDOW_MS,
  CODE_AI_PLANNER_STALE_QUEUE_RECOVERY_LIMIT,
  RUNPOD_HEALTH_MAX_ATTEMPTS,
  boundedRetryDelayMs,
  isRetryableHttpStatus,
  isTransientNetworkError,
  shouldRecoverStaleQueuedPlannerJob,
  staleCodePlannerQueueRecoveryExhausted,
} from "./CodeAICertificationResiliencePolicy.js";

const CONTRACT = "AVANTIQO_CODE_AI_PLANNER_EXECUTION_V2";
const OWNED_PROVIDER = "avantiqo-code";
const PLANNER_CAPABILITY = "ai.code.debug";
const LOCAL_REVIEW_SCOPE = "BENCHMARK_REVIEW_PREVIEW";
const RUNPOD_ENDPOINTS_URL =
  "https://rest.runpod.io/v1/endpoints?includeTemplate=false&includeWorkers=true";
const BENCHMARK_ESTIMATED_INPUT_TOKENS = 32768;
const BENCHMARK_ESTIMATED_OUTPUT_TOKENS = 4096;
const DEFAULT_POLL_INTERVAL_MS = 1200;
const DEFAULT_POLL_WINDOW_MS = 25000;
const MAX_POLL_WINDOW_MS = 60000;
const RUNPOD_QUEUE_BASE = "https://api.runpod.ai/v2";
const CODE_AI_USAGE_ID_CONTRACT = "AVANTIQO_CODE_AI_PLANNER_USAGE_ID_V1";
const CODE_AI_ZERO_WORKER_QUEUE_STALL_MS = 30_000;

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

async function runpodSafeReadResponse(url, key, {
  timeout_ms = 30_000,
  label = "CODE_AI_PLANNER_RUNPOD_SAFE_READ",
} = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < RUNPOD_HEALTH_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: "Bearer " + key,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(timeout_ms),
      });
      if (
        !isRetryableHttpStatus(response.status) ||
        attempt === RUNPOD_HEALTH_MAX_ATTEMPTS - 1
      ) {
        return response;
      }
      lastError = new Error(label + "_HTTP_" + response.status);
    } catch (error) {
      lastError = error;
      if (
        !isTransientNetworkError(error) ||
        attempt === RUNPOD_HEALTH_MAX_ATTEMPTS - 1
      ) {
        throw error;
      }
    }

    console.error(JSON.stringify({
      event: "AVANTIQO_CODE_PLANNER_SAFE_READ_RETRY",
      contract: CONTRACT,
      attempt: attempt + 1,
      max_attempts: RUNPOD_HEALTH_MAX_ATTEMPTS,
      label,
      reason: text(lastError?.message || lastError).slice(0, 180),
      provider_execution_submitted: false,
      endpoint_mutation_performed: false,
      production_deploy_performed: false,
      secrets_printed: false,
    }));
    await delay(boundedRetryDelayMs(attempt));
  }

  throw lastError || new Error(label + "_RETRY_EXHAUSTED");
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
  if (text(process.env.NODE_ENV).toLowerCase() !== "development") return {};
  const capability = text(raw.capability || raw?.input?.capability);
  if (capability !== PLANNER_CAPABILITY) return {};
  const providerEndpointId = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
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
      local_development_owned_code_preview: true,
      ...(providerEndpointId ? { provider_endpoint_id: providerEndpointId } : {}),
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
  return Boolean(
    text(process.env.NODE_ENV).toLowerCase() === "development" &&
    text(executionInput.provider_id) === OWNED_PROVIDER &&
    text(executionInput.capability || executionInput?.input?.capability) === PLANNER_CAPABILITY &&
    text(executionInput?.metadata?.execution_scope) === LOCAL_REVIEW_SCOPE
  );
}

async function assertLocalCodeEndpointAcceptingWork(executionInput = {}) {
  if (!localCodePlannerReview(executionInput)) return null;

  const explicitBaseUrl = text(process.env.AVANTIQO_CODE_POD_BASE_URL).replace(/\/+$/, "");
  const explicitToken = text(process.env.AVANTIQO_CODE_POD_TOKEN);
  if (explicitBaseUrl || explicitToken) {
    if (!explicitBaseUrl) throw new Error("CODE_AI_PLANNER_EXPLICIT_POD_BASE_URL_REQUIRED");
    if (explicitToken.length < 32) throw new Error("CODE_AI_PLANNER_EXPLICIT_POD_TOKEN_REQUIRED");
    return {
      transport: "EXPLICIT_GOVERNED_POD",
      accepting_work: true,
      serverless_endpoint_required: false,
      checked_at: new Date().toISOString(),
    };
  }

  if (enabled(process.env.AVANTIQO_CODE_WORKER_SESSION_ENABLED)) {
    const workerSessionRuntime = await import("./CodeAIWorkerSessionRuntime.js");
    const session = await workerSessionRuntime.resolveCodeAIWorkerSessionTransport();
    if (!session) {
      throw new Error("CODE_AI_PLANNER_WARM_SESSION_NOT_READY");
    }
    if (session.contract !== workerSessionRuntime.CODE_AI_WORKER_SESSION_CONTRACT) {
      throw new Error("CODE_AI_PLANNER_WARM_SESSION_CONTRACT_INVALID");
    }
    return {
      transport: "DURABLE_WARM_SESSION",
      worker_session_contract: session.contract,
      worker_session_id: text(session.session_id) || null,
      accepting_work: true,
      serverless_endpoint_required: false,
      checked_at: new Date().toISOString(),
    };
  }

  const endpointId = text(
    executionInput?.metadata?.provider_endpoint_id ||
    process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID,
  );
  const managementCredential = text(
    process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY,
  );
  if (!endpointId) {
    throw new Error("CODE_AI_PLANNER_RUNPOD_ENDPOINT_ID_REQUIRED");
  }
  if (!managementCredential) {
    throw new Error("CODE_AI_PLANNER_RUNPOD_MANAGEMENT_CREDENTIAL_REQUIRED");
  }

  let response;
  try {
    response = await runpodSafeReadResponse(
      RUNPOD_ENDPOINTS_URL,
      managementCredential,
      { label: "CODE_AI_PLANNER_RUNPOD_ENDPOINT_PREFLIGHT" },
    );
  } catch (error) {
    throw new Error(
      `CODE_AI_PLANNER_RUNPOD_ENDPOINT_PREFLIGHT_REQUEST_FAILED:${text(error?.message || error) || "UNKNOWN"}`,
    );
  }

  const body = await responseJson(response);
  if (!response.ok) {
    const detail = text(
      body?.detail ||
      body?.error?.message ||
      body?.error ||
      body?.message ||
      body?.code,
    );
    throw new Error(
      `CODE_AI_PLANNER_RUNPOD_ENDPOINT_PREFLIGHT_HTTP_${response.status}:${detail || "UNKNOWN"}`,
    );
  }

  const endpoints = Array.isArray(body) ? body : list(body?.endpoints);
  const endpoint = endpoints.find((candidate) => text(candidate?.id) === endpointId) || null;
  if (!endpoint) {
    throw new Error(`CODE_AI_PLANNER_RUNPOD_ENDPOINT_NOT_FOUND:${endpointId}`);
  }

  const workersMax = number(endpoint.workersMax, -1);
  if (workersMax < 1) {
    throw new Error(
      `CODE_AI_PLANNER_RUNPOD_ENDPOINT_PAUSED:max_workers=${workersMax}:endpoint=${endpointId}`,
    );
  }

  return {
    transport: "RUNPOD_SERVERLESS",
    endpoint_id: endpointId,
    endpoint_name: text(endpoint.name) || null,
    endpoint_version: number(endpoint.version, null),
    workers_min: number(endpoint.workersMin, null),
    workers_max: workersMax,
    accepting_work: true,
    serverless_endpoint_required: true,
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

async function runpodQueueJson(endpointId, pathname, options = {}) {
  const apiKey = text(process.env.RUNPOD_API_KEY);
  if (!apiKey) throw new Error("RUNPOD_CODE_QUEUE_CREDENTIAL_REQUIRED");
  const method = text(options.method || "GET").toUpperCase();
  const url = `${RUNPOD_QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`;
  const response = method === "GET"
    ? await runpodSafeReadResponse(url, apiKey, {
        timeout_ms: options.timeout_ms || 30_000,
        label: "CODE_AI_PLANNER_RUNPOD_QUEUE_READ",
      })
    : await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(options.timeout_ms || 30_000),
      });
  const body = await responseJson(response);
  if (!response.ok) {
    throw new Error(`CODE_AI_PLANNER_RUNPOD_QUEUE_HTTP_${response.status}:${text(body?.error || body?.message) || "UNKNOWN"}`);
  }
  return body;
}

function runpodQueueHealthSummary(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
  return {
    jobs: {
      in_queue: number(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: number(jobs.inProgress ?? jobs.in_progress, 0),
    },
    workers: {
      idle: number(workers.idle, 0),
      initializing: number(workers.initializing, 0),
      ready: number(workers.ready, 0),
      running: number(workers.running, 0),
      throttled: number(workers.throttled, 0),
      unhealthy: number(workers.unhealthy, 0),
    },
  };
}

function pendingAgeMs(startedAt) {
  const started = Date.parse(text(startedAt));
  return Number.isFinite(started) ? Math.max(0, Date.now() - started) : 0;
}

function zeroWorkerQueueStalled({ providerStatus, startedAt, health } = {}) {
  const normalized = runpodQueueHealthSummary(health);
  const workerCount = Object.values(normalized.workers)
    .reduce((sum, value) => sum + Math.max(0, number(value, 0)), 0);
  return (
    text(providerStatus).toLowerCase() === "queued" &&
    pendingAgeMs(startedAt) >= CODE_AI_ZERO_WORKER_QUEUE_STALL_MS &&
    normalized.jobs.in_queue > 0 &&
    normalized.jobs.in_progress === 0 &&
    workerCount === 0
  );
}

async function cancelAndSettlePlannerJob({
  serviceRuntime,
  pending,
  endpointId,
} = {}) {
  await runpodQueueJson(
    endpointId,
    `/cancel/${encodeURIComponent(pending.provider_job_id)}`,
    { method: "POST" },
  );

  const cancelDeadline = Date.now() + CODE_AI_PLANNER_STALE_CANCEL_SETTLE_WINDOW_MS;
  let canceledSettlement = null;
  while (Date.now() < cancelDeadline) {
    await delay(1000);
    canceledSettlement = await settleOnce(serviceRuntime, pending);
    if (!canceledSettlement?.pending) break;
  }
  if (!canceledSettlement || canceledSettlement.pending) {
    throw new Error(
      `CODE_AI_PLANNER_STALE_QUEUE_CANCEL_NOT_TERMINAL:${pending.provider_job_id}`,
    );
  }
  return canceledSettlement;
}

function completedDuringCancelResult(canceledSettlement, pending, reason) {
  if (canceledSettlement?.failed) return null;
  const completedOutput = plannerResultText(canceledSettlement);
  if (!completedOutput) {
    throw new Error("CODE_AI_PLANNER_STALE_QUEUE_CANCEL_COMPLETED_OUTPUT_REQUIRED");
  }
  return {
    success: true,
    pending: false,
    result: canceledSettlement,
    output: completedOutput,
    pending_execution: null,
    stale_queue_recovery: {
      canceled_provider_job_id: pending.provider_job_id,
      replacement_submitted: false,
      completed_during_cancel_settlement: true,
      reason,
    },
  };
}

async function recoverStaleQueuedPlannerExecution({
  serviceRuntime,
  pending,
  executionInput,
  result,
}) {
  if (!localCodePlannerReview(executionInput)) return null;
  if (text(pending.provider) !== OWNED_PROVIDER) return null;
  const executionTransport = text(pending?.metadata?.code_endpoint_preflight?.transport);
  if (executionTransport && executionTransport !== "RUNPOD_SERVERLESS") return null;

  const providerStatus = text(result?.provider_status || result?.output?.status).toLowerCase();
  const recoveryCount = Math.max(0, number(pending.stale_queue_recovery_count, 0));
  const endpointId = text(
    pending.provider_endpoint_id ||
    executionInput?.metadata?.provider_endpoint_id ||
    process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID,
  );
  if (!endpointId) return null;

  const rawHealth = await runpodQueueJson(endpointId, "/health");
  const health = runpodQueueHealthSummary(rawHealth);
  const zeroWorkerStall = zeroWorkerQueueStalled({
    providerStatus,
    startedAt: pending.started_at,
    health,
  });

  if (zeroWorkerStall) {
    const canceledSettlement = await cancelAndSettlePlannerJob({
      serviceRuntime,
      pending,
      endpointId,
    });
    const completed = completedDuringCancelResult(
      canceledSettlement,
      pending,
      "ZERO_WORKER_QUEUE_STALL",
    );
    if (completed) return completed;
    throw new Error(
      `CODE_AI_PLANNER_ZERO_WORKER_QUEUE_STALL:${pending.provider_job_id}:${pendingAgeMs(pending.started_at)}`,
    );
  }

  const recoveryExhausted = staleCodePlannerQueueRecoveryExhausted({
    provider: pending.provider,
    providerStatus,
    startedAt: pending.started_at,
    recoveryCount,
  });
  const recoverableStale = shouldRecoverStaleQueuedPlannerJob({
    provider: pending.provider,
    providerStatus,
    startedAt: pending.started_at,
    recoveryCount,
    health,
  });

  if (!recoveryExhausted && !recoverableStale) return null;

  const canceledSettlement = await cancelAndSettlePlannerJob({
    serviceRuntime,
    pending,
    endpointId,
  });
  const completed = completedDuringCancelResult(
    canceledSettlement,
    pending,
    recoveryExhausted ? "RECOVERY_EXHAUSTED" : "STALE_QUEUE_RECOVERY",
  );
  if (completed) return completed;

  if (recoveryExhausted || recoveryCount >= CODE_AI_PLANNER_STALE_QUEUE_RECOVERY_LIMIT) {
    throw new Error(
      `CODE_AI_PLANNER_STALE_QUEUE_RECOVERY_EXHAUSTED:${pending.provider_job_id}:${recoveryCount}`,
    );
  }

  let replacementInput = executionInput;
  const endpointPreflight = await assertLocalCodeEndpointAcceptingWork(replacementInput);
  if (endpointPreflight) {
    replacementInput = {
      ...replacementInput,
      metadata: {
        ...object(replacementInput.metadata),
        code_endpoint_preflight: endpointPreflight,
        stale_queue_recovery_count: recoveryCount + 1,
        recovered_from_provider_job_id: pending.provider_job_id,
      },
    };
  }

  const replacementUsageId = deterministicPlannerUsageId(
    replacementInput,
    recoveryCount + 1,
  );
  if (replacementUsageId) {
    replacementInput = {
      ...replacementInput,
      metadata: {
        ...object(replacementInput.metadata),
        code_ai_usage_id_contract: CODE_AI_USAGE_ID_CONTRACT,
        code_ai_usage_id: replacementUsageId,
      },
    };
  }

  const replacement = await serviceRuntime.execute(replacementInput);
  if (!replacement?.success) throw new Error("CODE_AI_PLANNER_STALE_QUEUE_REPLACEMENT_FAILED");
  if (!replacement?.pending) {
    const output = plannerResultText(replacement);
    if (!output) throw new Error("CODE_AI_PLANNER_COMPLETED_OUTPUT_REQUIRED");
    return {
      success: true,
      pending: false,
      result: replacement,
      output,
      pending_execution: null,
      stale_queue_recovery: {
        canceled_provider_job_id: pending.provider_job_id,
        replacement_submitted: true,
        replacement_provider_job_id: null,
      },
    };
  }

  const replacementPending = pendingDescriptor(replacement, replacementInput, {
    stale_queue_recovery_count: recoveryCount + 1,
    recovered_from_provider_job_id: pending.provider_job_id,
  });
  return {
    success: true,
    pending: true,
    result: replacement,
    output: null,
    pending_execution: replacementPending,
    stale_queue_recovery: {
      canceled_provider_job_id: pending.provider_job_id,
      replacement_submitted: true,
      replacement_provider_job_id: replacementPending.provider_job_id,
      recovery_count: replacementPending.stale_queue_recovery_count,
      recovery_limit: CODE_AI_PLANNER_STALE_QUEUE_RECOVERY_LIMIT,
    },
  };
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
  zero_worker_queue_stall_ms: CODE_AI_ZERO_WORKER_QUEUE_STALL_MS,
  execute: executeCodeAIPlannerRequest,
  resultText: plannerResultText,
});
