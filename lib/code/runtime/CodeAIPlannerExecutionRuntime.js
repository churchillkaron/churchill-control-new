const CONTRACT = "AVANTIQO_CODE_AI_PLANNER_EXECUTION_V1";
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  return {
    ...raw,
    ...preview,
    input: {
      ...input,
      ...(instructions ? { instructions } : {}),
    },
  };
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
    response = await fetch(RUNPOD_ENDPOINTS_URL, {
      headers: {
        Authorization: `Bearer ${managementCredential}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    });
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
    endpoint_id: endpointId,
    endpoint_name: text(endpoint.name) || null,
    endpoint_version: number(endpoint.version, null),
    workers_min: number(endpoint.workersMin, null),
    workers_max: workersMax,
    accepting_work: true,
    checked_at: new Date().toISOString(),
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
    provider_endpoint_id: text(executionInput?.metadata?.provider_endpoint_id) || null,
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
