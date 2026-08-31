import { createAvantiqoOwnedRunpodWorker } from "../avantiqo-owned/AvantiqoOwnedRunpodWorker.js";
import {
  resolveCodeAIWorkerSessionTransport,
  CODE_AI_WORKER_SESSION_CONTRACT,
} from "@/lib/code/runtime/CodeAIWorkerSessionRuntime";
import {
  ensureCodeAIServerlessAcceptingWork,
  reapIdleCodeAIServerlessWorker,
  isExactCodeAIServerlessPausedSubmissionError,
  codeAIServerlessZeroIdleEnabled,
} from "@/lib/code/runtime/CodeAIServerlessZeroIdleLifecycleRuntime";

const PROVIDER_ID = "avantiqo-code";
const ENGINE_CONTRACT = "AVANTIQO_CODE_ENGINE_V1";
const POD_HTTP_CONTRACT = "AVANTIQO_CODE_POD_HTTP_V3";
const POD_SUBMIT_PATH = "/v3/generations";
const POD_STATUS_PATH = "/v3/generations/{job_id}";
const DEFAULT_MODEL = "avantiqo-code-v1";
const DEFAULT_HTTP_TIMEOUT_MS = 30_000;
const SERVERLESS_WAKE_PROPAGATION_ATTEMPTS = 24;
const SERVERLESS_WAKE_PROPAGATION_DELAY_MS = 2_000;
const DELIVERY_SETTLEMENT_GUARD_CONTRACT =
  "AVANTIQO_CODE_DELIVERY_SETTLEMENT_GUARD_V1";
const PRIVATE_KEYS = new Set([
  "reasoning",
  "reasoning_content",
  "chain_of_thought",
  "chainofthought",
  "cot",
  "thoughts",
  "scratchpad",
  "analysis",
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanOutput(value, depth = 0) {
  if (depth > 8) return "[depth-limited]";
  if (Array.isArray(value)) return value.map((entry) => cleanOutput(entry, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !PRIVATE_KEYS.has(String(key).toLowerCase()))
      .map(([key, child]) => [key, cleanOutput(child, depth + 1)]),
  );
}

function completedResultText(result = {}) {
  const output = object(result.output);
  return typeof output.result === "string" ? output.result.trim() : "";
}

function failClosedCompletedResult(result = {}, errorCode) {
  const source = object(result);
  const jobId = text(
    source.provider_job_id ||
      source.providerJobId ||
      source.job_id ||
      source.jobId,
  );
  const podHttpContract = text(source.pod_http_contract);
  const podTransportSource = text(source.pod_transport_source);
  return {
    status: "failed",
    ...(jobId ? { provider_job_id: jobId } : {}),
    error: text(errorCode) || "AVANTIQO_CODE_COMPLETED_RESULT_REQUIRED",
    ...(podHttpContract ? { pod_http_contract: podHttpContract } : {}),
    ...(podTransportSource ? { pod_transport_source: podTransportSource } : {}),
    delivery_guard: {
      contract: DELIVERY_SETTLEMENT_GUARD_CONTRACT,
      original_status: text(source.status).toLowerCase() || null,
      deliverable_present: false,
      customer_charge_eligible: false,
      failed_closed: true,
      raw_reasoning_persisted: false,
    },
    raw_reasoning_persisted: false,
  };
}

function guardCompletedDeliverable(result = {}, errorCode) {
  const source = object(result);
  if (text(source.status).toLowerCase() !== "completed") return source;
  if (completedResultText(source)) return source;
  return failClosedCompletedResult(source, errorCode);
}

function instruction(input = {}) {
  return text(
    input.provider_prompt ||
      input.prompt ||
      input.instructions_text ||
      input.instructions ||
      input.input ||
      input.description ||
      input.title ||
      input.generation?.instructions,
  );
}

function validatePodTransport(baseUrlRaw, tokenRaw, source) {
  const baseUrl = text(baseUrlRaw).replace(/\/+$/, "");
  const token = text(tokenRaw);
  if (!baseUrl) throw new Error("AVANTIQO_CODE_POD_BASE_URL_REQUIRED");
  if (token.length < 32) throw new Error("AVANTIQO_CODE_POD_TOKEN_REQUIRED_MIN_32_CHARS");

  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("AVANTIQO_CODE_POD_BASE_URL_INVALID");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("AVANTIQO_CODE_POD_BASE_URL_PROTOCOL_INVALID");
  }

  return {
    baseUrl,
    token,
    source,
    timeoutMs: Math.max(
      1_000,
      Number(process.env.AVANTIQO_CODE_POD_HTTP_TIMEOUT_MS || DEFAULT_HTTP_TIMEOUT_MS),
    ),
  };
}

async function podTransportConfig() {
  const explicitBaseUrl = text(process.env.AVANTIQO_CODE_POD_BASE_URL);
  const explicitToken = text(process.env.AVANTIQO_CODE_POD_TOKEN);
  if (explicitBaseUrl || explicitToken) {
    return validatePodTransport(explicitBaseUrl, explicitToken, "EXPLICIT_GOVERNED_POD");
  }

  const session = await resolveCodeAIWorkerSessionTransport();
  if (!session) return null;
  if (session.contract !== CODE_AI_WORKER_SESSION_CONTRACT) {
    throw new Error("AVANTIQO_CODE_WORKER_SESSION_CONTRACT_INVALID");
  }
  return validatePodTransport(session.base_url, session.token, "DURABLE_WARM_SESSION");
}

async function podRequest(config, pathname, options = {}) {
  const response = await fetch(`${config.baseUrl}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(
      body?.error_message ||
      body?.detail ||
      body?.error ||
      body?.message ||
      raw,
    ).slice(0, 800);
    throw new Error(`AVANTIQO_CODE_POD_HTTP_${response.status}:${detail || "UNKNOWN"}`);
  }
  if (body?.contract !== POD_HTTP_CONTRACT || body?.transport !== "pod-http") {
    throw new Error("AVANTIQO_CODE_POD_HTTP_CONTRACT_INVALID");
  }
  if (body?.raw_reasoning_persisted !== false) {
    throw new Error("AVANTIQO_CODE_POD_RAW_REASONING_BOUNDARY_INVALID");
  }
  return body;
}

function podStatus(value) {
  const status = text(value).toUpperCase();
  if (status === "SUCCEEDED") return "completed";
  if (status === "FAILED") return "failed";
  if (status === "QUEUED") return "queued";
  return "processing";
}

function podEngineInput(input = {}) {
  const organizationId = text(input.context?.organization_id);
  const organizationServiceId = text(input.context?.organization_service_id);
  const usageId = text(input.context?.usage_id);
  if (!organizationId || !organizationServiceId || !usageId) {
    throw new Error("AVANTIQO_CODE_GOVERNED_SERVICE_EXECUTION_REQUIRED");
  }

  const capability = text(input.capability);
  if (!capability) throw new Error("AVANTIQO_CODE_CAPABILITY_REQUIRED");
  const workerInstruction = instruction(input);
  if (!workerInstruction) throw new Error("AVANTIQO_CODE_INSTRUCTION_REQUIRED");

  return {
    contract: ENGINE_CONTRACT,
    capability,
    model: text(input.model) || DEFAULT_MODEL,
    instruction: workerInstruction,
    structured_specification: cleanOutput({
      generation: input.generation,
      requirements: input.requirements,
      intent: input.intent,
      output_spec: input.output_spec,
      provider_parameters: input.provider_parameters,
      identity_lock: input.identity_lock,
      repair_contract: input.repair_contract,
      repair_specification: input.repair_specification,
      metadata: input.metadata,
    }),
    organization_id: organizationId,
    usage_id: usageId,
  };
}

const serverlessWorker = createAvantiqoOwnedRunpodWorker({
  providerId: PROVIDER_ID,
  family: "code",
  engineContract: ENGINE_CONTRACT,
  endpointEnv: "RUNPOD_AVANTIQO_CODE_ENDPOINT_ID",
  enabledEnv: "AVANTIQO_CODE_ENGINE_ENABLED",
  timeoutEnv: "AVANTIQO_CODE_ENGINE_TIMEOUT_MS",
  defaultModel: DEFAULT_MODEL,
  outputExtension: null,
});

async function reapAfterServerlessSubmissionFailure(submissionError) {
  try {
    const cleanup = await reapIdleCodeAIServerlessWorker();
    console.warn("AVANTIQO_CODE_ZERO_IDLE_SUBMISSION_REAP", {
      status: cleanup?.status || null,
      accepting_work: cleanup?.accepting_work === true,
      zero_running_worker: cleanup?.zero_running_worker === true,
      original_error_preserved: true,
      provider_inference_performed_by_cleanup: false,
      raw_reasoning_persisted: false,
      secrets_printed: false,
    });
  } catch (cleanupError) {
    console.error("AVANTIQO_CODE_ZERO_IDLE_SUBMISSION_REAP_FAILED", {
      submission_error: text(submissionError?.message || submissionError).slice(0, 800),
      cleanup_error: text(cleanupError?.message || cleanupError).slice(0, 800),
      original_error_preserved: true,
      raw_reasoning_persisted: false,
      secrets_printed: false,
    });
  }
}

async function executeServerlessWithOwnedWake(input = {}) {
  const zeroIdle = codeAIServerlessZeroIdleEnabled();
  const wake = zeroIdle
    ? await ensureCodeAIServerlessAcceptingWork()
    : null;

  for (let attempt = 1; attempt <= SERVERLESS_WAKE_PROPAGATION_ATTEMPTS; attempt += 1) {
    try {
      const result = await serverlessWorker.execute(input);
      return {
        ...result,
        output: {
          ...result.output,
          ...(wake
            ? {
                zero_idle_lifecycle: {
                  contract: wake.contract,
                  accepting_work: wake.accepting_work === true,
                  wake_mutation_performed: wake.mutation_performed === true,
                  wake_propagation_retries: attempt - 1,
                  workers_min: wake.endpoint_after?.workers_min ?? null,
                  workers_max: wake.endpoint_after?.workers_max ?? null,
                  idle_timeout_seconds:
                    wake.endpoint_after?.idle_timeout_seconds ??
                    wake.idle_timeout_seconds ??
                    null,
                  raw_reasoning_persisted: false,
                },
              }
            : {}),
        },
      };
    } catch (error) {
      const retryPausedWake = Boolean(
        zeroIdle &&
        isExactCodeAIServerlessPausedSubmissionError(error) &&
        attempt < SERVERLESS_WAKE_PROPAGATION_ATTEMPTS,
      );
      if (!retryPausedWake) {
        if (zeroIdle) await reapAfterServerlessSubmissionFailure(error);
        throw error;
      }

      await ensureCodeAIServerlessAcceptingWork();
      await delay(SERVERLESS_WAKE_PROPAGATION_DELAY_MS);
    }
  }

  const exhausted = new Error("AVANTIQO_CODE_ZERO_IDLE_WAKE_PROPAGATION_EXHAUSTED");
  if (zeroIdle) await reapAfterServerlessSubmissionFailure(exhausted);
  throw exhausted;
}

async function settleServerlessWithOwnedReap(input = {}) {
  const rawResult = await serverlessWorker.getStatus(input);
  const result = guardCompletedDeliverable(
    rawResult,
    "AVANTIQO_CODE_SERVERLESS_COMPLETED_RESULT_REQUIRED",
  );
  if (!codeAIServerlessZeroIdleEnabled()) return result;
  if (!["completed", "failed"].includes(text(result?.status).toLowerCase())) return result;

  try {
    const cleanup = await reapIdleCodeAIServerlessWorker();
    return {
      ...result,
      zero_idle_cleanup: cleanOutput(cleanup),
      zero_idle_cleanup_failed: false,
      raw_reasoning_persisted: false,
    };
  } catch (error) {
    return {
      ...result,
      zero_idle_cleanup: null,
      zero_idle_cleanup_failed: true,
      zero_idle_cleanup_error: text(error?.message || error).slice(0, 800),
      raw_reasoning_persisted: false,
    };
  }
}

export const AvantiqoCodeProvider = {
  id: PROVIDER_ID,

  async execute(input = {}) {
    const pod = await podTransportConfig();
    if (!pod) return executeServerlessWithOwnedWake(input);

    const model = text(input.model) || DEFAULT_MODEL;
    const engineInput = podEngineInput(input);
    const accepted = await podRequest(pod, POD_SUBMIT_PATH, {
      method: "POST",
      body: {
        id: text(input.context?.usage_id) || undefined,
        input: engineInput,
      },
    });
    const jobId = text(accepted.job_id);
    if (!jobId) throw new Error("AVANTIQO_CODE_POD_JOB_ID_REQUIRED");
    if (accepted.proxy_timeout_safe !== true) {
      throw new Error("AVANTIQO_CODE_POD_PROXY_TIMEOUT_SAFE_REQUIRED");
    }

    return {
      success: true,
      provider: PROVIDER_ID,
      model,
      output: {
        provider_job_id: jobId,
        status: podStatus(accepted.status || "QUEUED"),
        engine_contract: ENGINE_CONTRACT,
        capability: text(input.capability),
        infrastructure_provider:
          pod.source === "DURABLE_WARM_SESSION" ? "RUNPOD_WARM_SESSION_V1" : "RUNPOD_POD_V3",
        pod_transport_source: pod.source,
        pod_http_contract: POD_HTTP_CONTRACT,
        proxy_timeout_safe: true,
        raw_reasoning_persisted: false,
      },
    };
  },

  async getStatus(input = {}) {
    const pod = await podTransportConfig();
    if (!pod) return settleServerlessWithOwnedReap(input);

    const organizationId = text(input.context?.organization_id);
    const jobId = text(input.job_id || input.jobId || input.provider_job_id);
    if (!organizationId) throw new Error("organization_id required");
    if (!jobId) throw new Error("AVANTIQO_CODE_JOB_ID_REQUIRED");

    const body = await podRequest(
      pod,
      POD_STATUS_PATH.replace("{job_id}", encodeURIComponent(jobId)),
    );
    const status = podStatus(body.status);
    const output = cleanOutput(body.output);

    if (status === "failed") {
      return {
        status,
        provider_job_id: jobId,
        error: text(body.error_message || body.error_type) || "avantiqo-code execution failed",
        pod_http_contract: POD_HTTP_CONTRACT,
        pod_transport_source: pod.source,
        raw_reasoning_persisted: false,
      };
    }

    const providerResult = {
      status,
      provider_job_id: jobId,
      ...(status === "completed" ? { output } : {}),
      pod_http_contract: POD_HTTP_CONTRACT,
      pod_transport_source: pod.source,
      raw_reasoning_persisted: false,
    };

    if (status === "completed") {
      let contractError = null;
      if (!output || typeof output !== "object" || Array.isArray(output)) {
        contractError = "AVANTIQO_CODE_POD_COMPLETED_OUTPUT_REQUIRED";
      } else if (text(output.provider) !== PROVIDER_ID) {
        contractError = "AVANTIQO_CODE_POD_COMPLETED_PROVIDER_MISMATCH";
      } else if (text(output.engine_contract) !== ENGINE_CONTRACT) {
        contractError = "AVANTIQO_CODE_POD_COMPLETED_ENGINE_CONTRACT_MISMATCH";
      } else if (output.raw_reasoning_persisted !== false) {
        contractError = "AVANTIQO_CODE_POD_COMPLETED_REASONING_BOUNDARY_INVALID";
      }

      if (contractError) {
        return failClosedCompletedResult(providerResult, contractError);
      }
    }

    return guardCompletedDeliverable(
      providerResult,
      "AVANTIQO_CODE_POD_COMPLETED_RESULT_REQUIRED",
    );
  },
};