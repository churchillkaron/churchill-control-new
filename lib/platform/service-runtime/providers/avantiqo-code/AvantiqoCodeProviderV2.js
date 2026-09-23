import { AvantiqoCodeLocalQueueProvider, isCodeLocalJob, isCodeLocalCapability } from "./AvantiqoCodeLocalQueueProvider.js";
const PROVIDER_ID = "avantiqo-code";
const ENGINE_CONTRACT = "AVANTIQO_CODE_ENGINE_V1";
const MODAL_HTTP_CONTRACT = "AVANTIQO_CODE_MODAL_HTTP_V1";
const MODAL_TRANSPORT = "modal-function-call";
const MODAL_DIRECT_TRANSPORT = "modal-js-sdk-function-call-v1";
const MODAL_DIRECT_JOB_PREFIX = "modal-code-direct:";
const MODAL_APP_NAME = "avantiqo-code-real-write-one-shot";
const MODAL_GENERATE_FUNCTION = "generate";
const MODAL_INVENT_FUNCTION = "invent";
const DEFAULT_MODEL = "avantiqo-code-v1";
const DEFAULT_TIMEOUT_MS = 30_000;
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

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

function localComputeRequired(input = {}) {
  const policy = text(
    input.infrastructure_policy ||
      input.infrastructurePolicy ||
      input.compute_policy ||
      input.computePolicy,
  ).toLowerCase();
  return (
    policy === "local_only" ||
    enabled(input.local_compute_required ?? input.localComputeRequired) ||
    enabled(process.env.AVANTIQO_LOCAL_COMPUTE_REQUIRED)
  );
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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


let modalSdkPromise = null;
async function modalSdk() {
  if (!modalSdkPromise) modalSdkPromise = import("modal");
  return modalSdkPromise;
}

function directModalConfig() {
  const tokenId = text(process.env.MODAL_TOKEN_ID || process.env.AVANTIQO_MODAL_TOKEN_ID);
  const tokenSecret = text(process.env.MODAL_TOKEN_SECRET || process.env.AVANTIQO_MODAL_TOKEN_SECRET);
  if (!tokenId || !tokenSecret) return null;
  return { tokenId, tokenSecret, environment: text(process.env.AVANTIQO_MODAL_ENVIRONMENT || process.env.MODAL_ENVIRONMENT) };
}

function directFunctionForCapability(capability) {
  return text(capability) === "ai.code.invent" ? MODAL_INVENT_FUNCTION : MODAL_GENERATE_FUNCTION;
}

async function directClient(config) {
  const sdk = await modalSdk();
  return { sdk, client: new sdk.ModalClient({ tokenId: config.tokenId, tokenSecret: config.tokenSecret }) };
}

async function executeDirectModal(config, input = {}) {
  const model = text(input.model) || DEFAULT_MODEL;
  const { client } = await directClient(config);
  const lookup = config.environment ? { environment: config.environment } : {};
  const functionName = directFunctionForCapability(input.capability);
  const worker = await client.functions.fromName(MODAL_APP_NAME, functionName, lookup);
  const call = await worker.spawn([engineInput(input)]);
  const jobId = text(call.functionCallId);
  if (!jobId) throw new Error("AVANTIQO_CODE_MODAL_CALL_ID_REQUIRED");
  return { success: true, provider: PROVIDER_ID, model, output: {
    provider_job_id: `${MODAL_DIRECT_JOB_PREFIX}${jobId}`, status: "queued", engine_contract: ENGINE_CONTRACT, capability: text(input.capability),
    infrastructure_provider: "MODAL_H100_ASYNC_V1", modal_transport: MODAL_DIRECT_TRANSPORT, modal_app: MODAL_APP_NAME,
    modal_function: functionName, modal_gateway_used: false, raw_reasoning_persisted: false,
  } };
}

async function getDirectModalStatus(config, input = {}) {
  const organizationId = text(input.context?.organization_id);
  const jobId = text(input.job_id || input.jobId || input.provider_job_id);
  if (!organizationId) throw new Error("organization_id required");
  if (!jobId) throw new Error("AVANTIQO_CODE_JOB_ID_REQUIRED");
  if (!jobId.startsWith(MODAL_DIRECT_JOB_PREFIX)) throw new Error("AVANTIQO_CODE_DIRECT_JOB_ID_REQUIRED");
  const rawJobId = jobId.slice(MODAL_DIRECT_JOB_PREFIX.length);
  const { sdk, client } = await directClient(config);
  const call = await client.functionCalls.fromId(rawJobId);
  try {
    const result = await call.get({ timeoutMs: 0 });
    if (result?.success === false || text(result?.status).toLowerCase() === "failed") {
      return { status: "failed", provider_job_id: jobId, error: text(result?.error_code || result?.error || "AVANTIQO_CODE_MODAL_EXECUTION_FAILED"), infrastructure_provider: "MODAL_H100_ASYNC_V1", modal_transport: MODAL_DIRECT_TRANSPORT, modal_gateway_used: false, raw_reasoning_persisted: false };
    }
    return { status: "completed", provider_job_id: jobId, output: validateCompletedOutput(result), infrastructure_provider: "MODAL_H100_ASYNC_V1", modal_transport: MODAL_DIRECT_TRANSPORT, modal_gateway_used: false, raw_reasoning_persisted: false };
  } catch (error) {
    if (error instanceof sdk.FunctionTimeoutError || /Timeout exceeded:\s*0ms/i.test(text(error?.message))) {
      return { status: "processing", provider_job_id: jobId, infrastructure_provider: "MODAL_H100_ASYNC_V1", modal_transport: MODAL_DIRECT_TRANSPORT, modal_gateway_used: false, raw_reasoning_persisted: false };
    }
    if (sdk.OutputExpiredError && error instanceof sdk.OutputExpiredError) {
      return { status: "failed", provider_job_id: jobId, error: "AVANTIQO_CODE_MODAL_OUTPUT_EXPIRED", infrastructure_provider: "MODAL_H100_ASYNC_V1", modal_transport: MODAL_DIRECT_TRANSPORT, modal_gateway_used: false, raw_reasoning_persisted: false };
    }
    throw error;
  }
}

function modalConfig() {
  const baseUrl = text(process.env.AVANTIQO_CODE_MODAL_BASE_URL).replace(/\/+$/, "");
  const gatewayToken = text(process.env.AVANTIQO_CODE_MODAL_GATEWAY_TOKEN);
  const tokenId = text(process.env.AVANTIQO_CODE_MODAL_PROXY_TOKEN_ID);
  const tokenSecret = text(process.env.AVANTIQO_CODE_MODAL_PROXY_TOKEN_SECRET);
  if (!baseUrl && !gatewayToken && !tokenId && !tokenSecret) {
    throw new Error("AVANTIQO_CODE_MODAL_CONFIGURATION_REQUIRED");
  }
  if (!baseUrl) throw new Error("AVANTIQO_CODE_MODAL_BASE_URL_REQUIRED");
  if (!/^https:\/\//i.test(baseUrl)) throw new Error("AVANTIQO_CODE_MODAL_BASE_URL_HTTPS_REQUIRED");

  const gatewayConfigured = gatewayToken.length >= 40;
  const proxyConfigured = tokenId.startsWith("wk-") && tokenSecret.startsWith("ws-");
  if (!gatewayConfigured && !proxyConfigured) {
    throw new Error("AVANTIQO_CODE_MODAL_AUTH_REQUIRED");
  }

  return {
    baseUrl,
    authMode: gatewayConfigured ? "BEARER_GATEWAY_V1" : "MODAL_PROXY_V1",
    gatewayToken: gatewayConfigured ? gatewayToken : null,
    tokenId: proxyConfigured ? tokenId : null,
    tokenSecret: proxyConfigured ? tokenSecret : null,
    timeoutMs: Math.max(
      1_000,
      Number(process.env.AVANTIQO_CODE_MODAL_HTTP_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    ),
  };
}

function engineInput(input = {}) {
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

async function modalRequest(config, pathname, options = {}) {
  const authHeaders = config.authMode === "BEARER_GATEWAY_V1"
    ? { Authorization: `Bearer ${config.gatewayToken}` }
    : { "Modal-Key": config.tokenId, "Modal-Secret": config.tokenSecret };
  const response = await fetch(`${config.baseUrl}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      ...authHeaders,
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
    const detail = text(body?.detail || body?.error_code || body?.error || body?.message || raw).slice(0, 800);
    throw new Error(`AVANTIQO_CODE_MODAL_HTTP_${response.status}:${detail || "UNKNOWN"}`);
  }
  if (body?.contract !== MODAL_HTTP_CONTRACT || body?.transport !== MODAL_TRANSPORT) {
    throw new Error("AVANTIQO_CODE_MODAL_HTTP_CONTRACT_INVALID");
  }
  if (body?.raw_reasoning_persisted !== false) {
    throw new Error("AVANTIQO_CODE_MODAL_REASONING_BOUNDARY_INVALID");
  }
  return body;
}

function validateCompletedOutput(output) {
  const value = object(cleanOutput(output));
  if (text(value.status) !== "completed") {
    throw new Error("AVANTIQO_CODE_MODAL_COMPLETED_STATUS_REQUIRED");
  }
  if (text(value.provider) !== PROVIDER_ID) {
    throw new Error("AVANTIQO_CODE_MODAL_PROVIDER_CONTRACT_INVALID");
  }
  if (text(value.model) !== DEFAULT_MODEL) {
    throw new Error("AVANTIQO_CODE_MODAL_MODEL_CONTRACT_INVALID");
  }
  if (text(value.engine_contract) !== ENGINE_CONTRACT) {
    throw new Error("AVANTIQO_CODE_MODAL_ENGINE_CONTRACT_INVALID");
  }
  if (!text(value.result)) {
    throw new Error("AVANTIQO_CODE_MODAL_COMPLETED_RESULT_REQUIRED");
  }
  if (value.raw_reasoning_persisted !== false) {
    throw new Error("AVANTIQO_CODE_MODAL_REASONING_BOUNDARY_INVALID");
  }
  return value;
}

async function executeModal(config, input = {}) {
  const model = text(input.model) || DEFAULT_MODEL;
  const accepted = await modalRequest(config, "/v1/jobs", {
    method: "POST",
    body: engineInput(input),
  });
  const jobId = text(accepted.job_id);
  if (!jobId) throw new Error("AVANTIQO_CODE_MODAL_JOB_ID_REQUIRED");
  if (accepted.proxy_timeout_safe !== true) {
    throw new Error("AVANTIQO_CODE_MODAL_PROXY_TIMEOUT_SAFE_REQUIRED");
  }
  return {
    success: true,
    provider: PROVIDER_ID,
    model,
    output: {
      provider_job_id: jobId,
      status: "queued",
      engine_contract: ENGINE_CONTRACT,
      capability: text(input.capability),
      infrastructure_provider: "MODAL_H100_ASYNC_V1",
      modal_http_contract: MODAL_HTTP_CONTRACT,
      modal_transport: MODAL_TRANSPORT,
      modal_auth_mode: config.authMode,
      proxy_timeout_safe: true,
      raw_reasoning_persisted: false,
    },
  };
}

async function getModalStatus(config, input = {}) {
  const organizationId = text(input.context?.organization_id);
  const jobId = text(input.job_id || input.jobId || input.provider_job_id);
  if (!organizationId) throw new Error("organization_id required");
  if (!jobId) throw new Error("AVANTIQO_CODE_JOB_ID_REQUIRED");

  const body = await modalRequest(config, `/v1/jobs/${encodeURIComponent(jobId)}`);
  const status = text(body.status).toUpperCase();
  if (status === "RUNNING" || status === "QUEUED") {
    return {
      status: "processing",
      provider_job_id: jobId,
      modal_http_contract: MODAL_HTTP_CONTRACT,
      modal_transport: MODAL_TRANSPORT,
      modal_auth_mode: config.authMode,
      infrastructure_provider: "MODAL_H100_ASYNC_V1",
      raw_reasoning_persisted: false,
    };
  }
  if (status === "FAILED") {
    return {
      status: "failed",
      provider_job_id: jobId,
      error: text(body.error_code || body.error_message) || "avantiqo-code Modal execution failed",
      modal_http_contract: MODAL_HTTP_CONTRACT,
      modal_transport: MODAL_TRANSPORT,
      modal_auth_mode: config.authMode,
      infrastructure_provider: "MODAL_H100_ASYNC_V1",
      raw_reasoning_persisted: false,
    };
  }
  if (status !== "SUCCEEDED") {
    throw new Error(`AVANTIQO_CODE_MODAL_STATUS_INVALID:${status || "EMPTY"}`);
  }

  return {
    status: "completed",
    provider_job_id: jobId,
    output: validateCompletedOutput(body.output),
    modal_http_contract: MODAL_HTTP_CONTRACT,
    modal_transport: MODAL_TRANSPORT,
    modal_auth_mode: config.authMode,
    infrastructure_provider: "MODAL_H100_ASYNC_V1",
    raw_reasoning_persisted: false,
  };
}

export const AvantiqoCodeProviderV2 = {
  id: PROVIDER_ID,

  async execute(input = {}) {
    const localRequired = localComputeRequired(input);
    if (isCodeLocalCapability(input.capability)) {
      try {
        if (await AvantiqoCodeLocalQueueProvider.available()) {
          return await AvantiqoCodeLocalQueueProvider.execute(input);
        }
      } catch (error) {
        if (localRequired) throw error;
        console.error("AVANTIQO_CODE_LOCAL_RUNTIME_FAILED", {
          error: text(error?.message || error).slice(0, 500),
        });
      }
    }
    if (localRequired) {
      throw new Error("AVANTIQO_CODE_LOCAL_RUNTIME_REQUIRED");
    }
    const direct = directModalConfig();
    if (direct) return executeDirectModal(direct, input);
    const modal = modalConfig();
    return executeModal(modal, input);
  },

  async getStatus(input = {}) {
    const jobId = text(input.job_id || input.jobId || input.provider_job_id);
    if (isCodeLocalJob(jobId)) return AvantiqoCodeLocalQueueProvider.getStatus(input);
    const direct = directModalConfig();
    if (direct) return getDirectModalStatus(direct, input);
    const modal = modalConfig();
    return getModalStatus(modal, input);
  },
};
