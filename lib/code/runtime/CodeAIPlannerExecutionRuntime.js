import { createHash } from "node:crypto";

import {
  codeAIInteractivePreviewContext,
} from "./CodeAIInteractivePreviewContextRuntime.js";
import {
  getIntelligenceLocalQueueStatus,
  isIntelligenceLocalQueueJob,
} from "../../platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js";
import {
  AvantiqoCodeLocalQueueProvider,
  isCodeLocalJob,
} from "../../platform/service-runtime/providers/avantiqo-code/AvantiqoCodeLocalQueueProvider.js";

const CONTRACT = "AVANTIQO_CODE_AI_PLANNER_EXECUTION_V2";
const OWNED_PROVIDER = "avantiqo-code";
const PLANNER_CAPABILITY = "ai.code.debug";
const LOCAL_REVIEW_SCOPE = "BENCHMARK_REVIEW_PREVIEW";
const BENCHMARK_ESTIMATED_INPUT_TOKENS = 32768;
const BENCHMARK_ESTIMATED_OUTPUT_TOKENS = 4096;
const DEFAULT_POLL_INTERVAL_MS = 250;
const DEFAULT_POLL_WINDOW_MS = 25000;
const MAX_POLL_WINDOW_MS = 60000;
const MAX_RUNTIME_RECOVERY_ATTEMPTS = 6;
const MAX_STALE_LOCAL_QUEUE_RECOVERIES = 1;
const STALE_LOCAL_INTERACTIVE_RECOVERY_MS = 105000;
const STALE_LOCAL_STRONG_RECOVERY_MS = 170000;
const RUNTIME_RECOVERY_DELAYS_MS = Object.freeze([250, 750, 1500, 3000, 6000]);
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

function recoverablePlannerRuntimeError(error) {
  const message = text(error?.message || error).toUpperCase();
  return Boolean(
    message.includes("PROVIDER_RUNTIME_UNAVAILABLE") ||
    message.includes("PROVIDER RUNTIME UNAVAILABLE") ||
    message.includes("NO PRICED EXECUTABLE PROVIDER AVAILABLE FOR AI.CODE.DEBUG") ||
    message.includes("AVANTIQO_CODE_LOCAL_NODE_UNAVAILABLE") ||
    message.includes("AVANTIQO_LOCAL_COMPUTE_QUEUE_REQUIRED") ||
    message.includes("AVANTIQO_CODE_OLLAMA_TIMEOUT") ||
    message.includes("AVANTIQO_CODE_STRONG_MODEL_GPU_HEADROOM_REQUIRED") ||
    message.includes("SERVICE_USAGE_IDEMPOTENT_START_PREEXISTING") ||
    /\b(?:500|502|503|504|520|521|522|523|524)\b/.test(message) ||
    message.includes("WEB SERVER IS DOWN") ||
    message.includes("BAD GATEWAY") ||
    message.includes("GATEWAY TIMEOUT") ||
    message.includes("TEMPORARILY UNAVAILABLE") ||
    message.includes("ECONNRESET") ||
    message.includes("ECONNREFUSED") ||
    message.includes("ETIMEDOUT") ||
    message.includes("FETCH FAILED")
  );
}

function executionInputForRuntimeRecovery(executionInput = {}, recoveryCount = 0) {
  const normalized = object(executionInput);
  const metadata = object(normalized.metadata);
  const usageId = deterministicPlannerUsageId(normalized, recoveryCount);
  return {
    ...normalized,
    metadata: {
      ...metadata,
      ...(usageId ? { code_ai_usage_id: usageId } : {}),
      code_ai_runtime_recovery_attempt: recoveryCount,
      code_ai_runtime_recovery_active: recoveryCount > 0,
      code_ai_runtime_recovery_contract: "AVANTIQO_CODE_AI_RUNTIME_RECOVERY_V1",
    },
  };
}

async function executeWithRuntimeRecovery(serviceRuntime, executionInput = {}) {
  let lastError = null;
  const interactivePreview = codeAIInteractivePreviewContext();
  const maximumAttempts = interactivePreview?.authorized === true
    ? Math.min(2, MAX_RUNTIME_RECOVERY_ATTEMPTS)
    : MAX_RUNTIME_RECOVERY_ATTEMPTS;
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    const currentInput = executionInputForRuntimeRecovery(executionInput, attempt);
    try {
      const result = await serviceRuntime.execute(currentInput);
      return {
        result,
        execution_input: currentInput,
        recovery_attempts: attempt,
        recovered: attempt > 0,
      };
    } catch (error) {
      lastError = error;
      if (!recoverablePlannerRuntimeError(error) || attempt >= maximumAttempts - 1) throw error;
      await delay(RUNTIME_RECOVERY_DELAYS_MS[Math.min(attempt, RUNTIME_RECOVERY_DELAYS_MS.length - 1)]);
    }
  }
  throw lastError || new Error("CODE_AI_RUNTIME_RECOVERY_EXHAUSTED");
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
    "../../platform/service-runtime/execution/ServiceExecutionRuntime.js"
  );
  return runtime.ServiceExecutionRuntime;
}

function localDevelopmentOwnedReviewPolicy(raw = {}) {
  const localDevelopment = text(process.env.NODE_ENV).toLowerCase() === "development";
  const interactivePreview = codeAIInteractivePreviewContext();
  const input = object(raw.input);
  const providerPolicy = object(raw.provider_policy);
  const governedLocalCompute =
    text(raw.provider_id) === OWNED_PROVIDER &&
    input.local_compute_required === true &&
    text(input.infrastructure_policy).toLowerCase() === "local_only" &&
    providerPolicy.owned_only_required === true &&
    providerPolicy.external_fallback_allowed === false &&
    list(providerPolicy.allowed_providers).length === 1 &&
    text(list(providerPolicy.allowed_providers)[0]) === OWNED_PROVIDER;
  if (
    !localDevelopment &&
    interactivePreview?.authorized !== true &&
    !governedLocalCompute
  ) return {};
  const capability = text(raw.capability || input.capability);
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
      studio_preproduction_review: true,
      local_owned_zero_price_preview: true,
      benchmark_pricing_estimate: {
        input_tokens: BENCHMARK_ESTIMATED_INPUT_TOKENS,
        output_tokens: BENCHMARK_ESTIMATED_OUTPUT_TOKENS,
      },
    },
    metadata: {
      ...object(raw.metadata),
      execution_scope: LOCAL_REVIEW_SCOPE,
      benchmark_only: true,
      studio_preproduction_review: true,
      local_owned_zero_price_preview: true,
      production_certified: false,
      local_development_owned_code_preview: localDevelopment,
      code_ai_governed_local_compute: governedLocalCompute,
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
      interactive_code: true,
      origin_module: "CODE_AI_PLANNER",
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

function plannerProgressContext(executionInput = {}, pending = {}) {
  const metadata = object(executionInput?.metadata || pending?.metadata);
  const objective = text(metadata.code_ai_objective).replace(/\s+/g, " ");
  const focusedTarget = text(metadata.code_ai_focused_target_path);
  const allowedTarget = list(metadata.code_ai_allowed_edit_paths).map((value) => text(value)).find(Boolean) || "";
  const target = focusedTarget || allowedTarget;
  const iteration = Math.max(0, Math.trunc(number(metadata.code_ai_iteration, 0)));
  const targetText = target ? ` Target: ${target}.` : "";
  const objectiveText = objective ? ` Mission: ${objective.slice(0, 220)}${objective.length > 220 ? "…" : ""}.` : "";
  const iterationText = iteration > 0 ? ` Planning pass ${iteration}.` : "";
  return { target, objective, iteration, targetText, objectiveText, iterationText };
}

function plannerProgressDescription(kind, executionInput = {}, pending = {}, pollCount = 0) {
  const detail = plannerProgressContext(executionInput, pending);
  const startedAt = Date.parse(text(pending?.started_at));
  const elapsedSeconds = Number.isFinite(startedAt)
    ? Math.max(0, Math.round((Date.now() - startedAt) / 1000))
    : null;
  const elapsedText = elapsedSeconds === null ? "" : ` ${elapsedSeconds}s elapsed.`;
  if (kind === "starting") return `I’ve loaded the current repository evidence.${detail.targetText}${detail.objectiveText} I’m asking the local Code engine for the next executable repository step.`;
  if (kind === "queued") return `The local Code engine is working on the next repository step.${detail.iterationText}${detail.targetText}`;
  if (kind === "checking") return `The same local Code job is still running; it has not been restarted.${elapsedText}${detail.targetText}${pollCount > 1 ? ` Check ${pollCount}.` : ""}`;
  if (kind === "ready") return `The local Code result is back.${detail.targetText} I’m validating the returned repository step against the current workspace before execution.`;
  return `Code is working on the current repository step.${detail.targetText}`;
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
      metadata.code_studio_interactive_preview === true ||
      metadata.code_ai_governed_local_compute === true
    )
  );
}

async function assertLocalCodeEndpointAcceptingWork(executionInput = {}) {
  if (!localCodePlannerReview(executionInput)) return null;
  return {
    transport: "LOCAL_DURABLE_QUEUE",
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

function assertPendingDescriptor(value, organizationId, executionInput = {}) {
  const pending = object(value);
  if (text(pending.contract) !== CONTRACT) throw new Error("CODE_AI_PLANNER_PENDING_CONTRACT_INVALID");
  if (!organizationId || text(pending.organization_id) !== organizationId) {
    throw new Error("CODE_AI_PLANNER_PENDING_ORGANIZATION_MISMATCH");
  }
  for (const field of ["provider", "provider_job_id", "usage_id"]) {
    if (!text(pending[field])) throw new Error(`CODE_AI_PLANNER_PENDING_${field.toUpperCase()}_REQUIRED`);
  }
  const pendingMetadata = object(pending.metadata);
  const executionMetadata = object(executionInput?.metadata);
  const pendingMissionId = text(pendingMetadata.code_ai_mission_id);
  const expectedMissionId = text(executionMetadata.code_ai_mission_id);
  if (!pendingMissionId || !expectedMissionId || pendingMissionId !== expectedMissionId) {
    throw new Error("CODE_AI_PLANNER_PENDING_MISSION_MISMATCH");
  }
  const pendingIteration = Math.trunc(number(pendingMetadata.code_ai_iteration, 0));
  const expectedIteration = Math.trunc(number(executionMetadata.code_ai_iteration, 0));
  if (pendingIteration <= 0 || expectedIteration <= 0 || pendingIteration !== expectedIteration) {
    throw new Error("CODE_AI_PLANNER_PENDING_ITERATION_MISMATCH");
  }
  const expectedUsageId = deterministicPlannerUsageId(executionInput, Math.max(0, number(pendingMetadata.code_ai_runtime_recovery_attempt, 0)));
  if (expectedUsageId && text(pending.usage_id) !== expectedUsageId) {
    throw new Error("CODE_AI_PLANNER_PENDING_USAGE_MISMATCH");
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

async function transientPlannerPollRetry(operation, { attempts = 3 } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!recoverablePlannerRuntimeError(error) || attempt >= attempts) throw error;
      await delay(Math.min(1500, 200 * (2 ** (attempt - 1))));
    }
  }
  throw lastError || new Error("CODE_AI_PLANNER_POLL_RETRY_EXHAUSTED");
}

async function fastLocalPlannerJobStatus(pending) {
  const providerJobId = text(pending?.provider_job_id);
  if (!providerJobId) return null;
  if (isCodeLocalJob(providerJobId)) {
    return AvantiqoCodeLocalQueueProvider.getStatus({ provider_job_id: providerJobId });
  }
  if (isIntelligenceLocalQueueJob(providerJobId)) {
    return getIntelligenceLocalQueueStatus({ provider_job_id: providerJobId });
  }
  return null;
}

async function recoverStaleQueuedPlannerExecution({ serviceRuntime, pending, executionInput, onProgress = null } = {}) {
  const providerJobId = text(pending?.provider_job_id);
  if (!providerJobId || !isCodeLocalJob(providerJobId)) return null;
  const startedAt = Date.parse(text(pending?.started_at));
  const ageMs = Number.isFinite(startedAt) ? Math.max(0, Date.now() - startedAt) : 0;
  const recoveryCount = Math.max(0, number(pending?.stale_queue_recovery_count, 0));
  const plannerSpec = object(executionInput?.input?.structured_specification);
  const strongModelRequired =
    plannerSpec.implementation_required === true ||
    plannerSpec.discovery_locked === true ||
    plannerSpec.implementation_present === true ||
    plannerSpec.pre_edit_mutation_blocked_until_loaded === true;
  const staleThresholdMs = strongModelRequired
    ? STALE_LOCAL_STRONG_RECOVERY_MS
    : STALE_LOCAL_INTERACTIVE_RECOVERY_MS;
  if (ageMs < staleThresholdMs || recoveryCount >= MAX_STALE_LOCAL_QUEUE_RECOVERIES) return null;

  const finalStatus = await transientPlannerPollRetry(() => fastLocalPlannerJobStatus(pending));
  const finalStatusValue = text(finalStatus?.status).toLowerCase();
  if (finalStatusValue === "failed") {
    throw new Error(text(finalStatus?.error) || "CODE_AI_PLANNER_PROVIDER_EXECUTION_FAILED");
  }
  if (finalStatusValue === "completed") {
    const settled = await transientPlannerPollRetry(() => settleOnce(serviceRuntime, pending));
    if (settled?.failed || settled?.success === false) {
      throw new Error(text(settled?.error) || "CODE_AI_PLANNER_PROVIDER_EXECUTION_FAILED");
    }
    if (!settled?.pending) {
      const output = plannerResultText(settled);
      if (!output) throw new Error("CODE_AI_PLANNER_COMPLETED_OUTPUT_REQUIRED");
      return { success: true, pending: false, result: settled, output, pending_execution: null };
    }
  }
  // Queue wait is not a reason to churn the same work item to the back of the
  // lane. Recovery is reserved for an exact local Code job that is actively
  // processing beyond the model-tier deadline.
  if (finalStatusValue !== "processing") return null;

  if (typeof serviceRuntime?.cancelPending !== "function") return null;
  await Promise.resolve(onProgress?.({
    phase: "LOCAL_CODE_STALE_JOB_RECOVERY",
    status: "running",
    description: `The local Code job exceeded the bounded queue window. I’m cancelling only that exact stale job and resubmitting the same planner step once.`,
    provider_job_id: providerJobId,
    stale_age_ms: ageMs,
    recovery_count: recoveryCount + 1,
  })).catch(() => null);

  await serviceRuntime.cancelPending({
    organization_id: pending.organization_id,
    provider: pending.provider,
    provider_job_id: providerJobId,
    usage_id: pending.usage_id,
    pricing: pending.pricing,
    metadata: pending.metadata,
    credential_id: pending.credential_id,
    reason: "CODE_AI_PLANNER_STALE_LOCAL_JOB_RECOVERY",
  });

  const nextRecoveryCount = recoveryCount + 1;
  const recoveredInput = executionInputForRuntimeRecovery(executionInput, nextRecoveryCount);
  const retried = await serviceRuntime.execute(recoveredInput);
  if (!retried?.success) throw new Error("CODE_AI_PLANNER_STALE_RECOVERY_EXECUTION_FAILED");
  if (!retried?.pending) {
    const output = plannerResultText(retried);
    if (!output) throw new Error("CODE_AI_PLANNER_COMPLETED_OUTPUT_REQUIRED");
    return { success: true, pending: false, result: retried, output, pending_execution: null };
  }
  return {
    success: true,
    pending: true,
    result: retried,
    output: null,
    pending_execution: pendingDescriptor(retried, recoveredInput, {
      stale_queue_recovery_count: nextRecoveryCount,
      recovered_from_provider_job_id: providerJobId,
    }),
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
  on_progress = null,
} = {}) {
  let executionInput = normalizedExecutionInput(execution_input);
  const organizationId = text(executionInput.organization_id || pending_execution?.organization_id);
  if (!organizationId) throw new Error("CODE_AI_PLANNER_ORGANIZATION_REQUIRED");

  const serviceRuntime = service_runtime || await defaultServiceRuntime();
  if (!serviceRuntime || typeof serviceRuntime.execute !== "function" || typeof serviceRuntime.settle !== "function") {
    throw new Error("CODE_AI_PLANNER_SERVICE_RUNTIME_INVALID");
  }

  const emitProgress = async (event = {}) => {
    if (typeof on_progress !== "function") return;
    await Promise.resolve(on_progress(event)).catch(() => null);
  };

  let result;
  let pending;
  if (pending_execution) {
    await emitProgress({
      phase: "LOCAL_CODE_RESULT_CHECK",
      status: "running",
      description: plannerProgressDescription("checking", executionInput, pending_execution, 1),
      provider_job_id: text(pending_execution?.provider_job_id) || null,
    });
    pending = assertPendingDescriptor(pending_execution, organizationId, executionInput);
    result = { pending: true };
  } else {
    await emitProgress({
      phase: "LOCAL_CODE_STARTING",
      status: "running",
      description: plannerProgressDescription("starting", executionInput),
    });
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
    const recoveredExecution = await executeWithRuntimeRecovery(serviceRuntime, executionInput);
    result = recoveredExecution.result;
    executionInput = recoveredExecution.execution_input;
    if (!result?.success) throw new Error("CODE_AI_PLANNER_EXECUTION_FAILED");
    if (recoveredExecution.recovered) {
      result = {
        ...result,
        code_ai_runtime_recovery: {
          contract: "AVANTIQO_CODE_AI_RUNTIME_RECOVERY_V1",
          recovered: true,
          attempts: recoveredExecution.recovery_attempts,
          final_provider: text(result?.provider) || OWNED_PROVIDER,
          raw_reasoning_persisted: false,
        },
      };
    }
    if (!result?.pending) {
      const output = plannerResultText(result);
      if (!output) throw new Error("CODE_AI_PLANNER_COMPLETED_OUTPUT_REQUIRED");
      await emitProgress({
        phase: "LOCAL_CODE_RESULT_READY",
        status: "running",
        description: plannerProgressDescription("ready", executionInput),
      });
      return { success: true, pending: false, result, output, pending_execution: null };
    }
    pending = pendingDescriptor(result, executionInput);
    await emitProgress({
      phase: "LOCAL_CODE_JOB_QUEUED",
      status: "running",
      description: plannerProgressDescription("queued", executionInput, pending),
      provider_job_id: text(pending.provider_job_id) || null,
    });
  }

  const interval = Math.max(250, Math.min(5000, number(poll_interval_ms, DEFAULT_POLL_INTERVAL_MS)));
  const windowMs = Math.max(1000, Math.min(MAX_POLL_WINDOW_MS, number(poll_window_ms, DEFAULT_POLL_WINDOW_MS)));
  const deadline = Date.now() + windowMs;

  let pollCount = 0;
  while (Date.now() < deadline) {
    await delay(interval);
    pollCount += 1;
    const publishPollProgress = pollCount === 1 || pollCount % 5 === 0;
    if (publishPollProgress) {
      await emitProgress({
        phase: "LOCAL_CODE_RESULT_CHECK",
        status: "running",
        description: plannerProgressDescription("checking", executionInput, pending, pollCount),
        provider_job_id: text(pending.provider_job_id) || null,
        poll_count: pollCount,
        progress_throttled: true,
      });
    }
    const fastLocalStatus = await transientPlannerPollRetry(() => fastLocalPlannerJobStatus(pending));
    if (fastLocalStatus) {
      if (text(fastLocalStatus.status).toLowerCase() === "failed") {
        throw new Error(text(fastLocalStatus.error) || "CODE_AI_PLANNER_PROVIDER_EXECUTION_FAILED");
      }
      if (text(fastLocalStatus.status).toLowerCase() !== "completed") continue;
    }

    result = await transientPlannerPollRetry(() => settleOnce(serviceRuntime, pending));
    if (result?.failed || result?.success === false) {
      throw new Error(text(result?.error) || "CODE_AI_PLANNER_PROVIDER_EXECUTION_FAILED");
    }
    if (result?.pending) continue;
    const output = plannerResultText(result);
    if (!output) throw new Error("CODE_AI_PLANNER_COMPLETED_OUTPUT_REQUIRED");
    await emitProgress({
      phase: "LOCAL_CODE_RESULT_READY",
      status: "running",
      description: plannerProgressDescription("ready", executionInput, pending),
      provider_job_id: text(pending.provider_job_id) || null,
    });
    return { success: true, pending: false, result, output, pending_execution: null };
  }

  const staleRecovery = await recoverStaleQueuedPlannerExecution({
    serviceRuntime,
    pending,
    executionInput,
    result,
    onProgress: emitProgress,
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
