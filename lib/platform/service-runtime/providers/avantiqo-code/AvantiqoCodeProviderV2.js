import { AvantiqoCodeProvider as RunpodCodeProvider } from "./AvantiqoCodeProvider.js";

const PROVIDER_ID = "avantiqo-code";
const ENGINE_CONTRACT = "AVANTIQO_CODE_ENGINE_V1";
const MODAL_HTTP_CONTRACT = "AVANTIQO_CODE_MODAL_HTTP_V1";
const MODAL_TRANSPORT = "modal-function-call";
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

function modalConfig() {
  const baseUrl = text(process.env.AVANTIQO_CODE_MODAL_BASE_URL).replace(/\/+$/, "");
  const tokenId = text(process.env.AVANTIQO_CODE_MODAL_PROXY_TOKEN_ID);
  const tokenSecret = text(process.env.AVANTIQO_CODE_MODAL_PROXY_TOKEN_SECRET);
  if (!baseUrl && !tokenId && !tokenSecret) return null;
  if (!baseUrl) throw new Error("AVANTIQO_CODE_MODAL_BASE_URL_REQUIRED");
  if (!/^https:\/\//i.test(baseUrl)) throw new Error("AVANTIQO_CODE_MODAL_BASE_URL_HTTPS_REQUIRED");
  if (!tokenId.startsWith("wk-")) throw new Error("AVANTIQO_CODE_MODAL_PROXY_TOKEN_ID_INVALID");
  if (!tokenSecret.startsWith("ws-")) throw new Error("AVANTIQO_CODE_MODAL_PROXY_TOKEN_SECRET_INVALID");
  return {
    baseUrl,
    tokenId,
    tokenSecret,
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
  const response = await fetch(`${config.baseUrl}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      "Modal-Key": config.tokenId,
      "Modal-Secret": config.tokenSecret,
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
    infrastructure_provider: "MODAL_H100_ASYNC_V1",
    raw_reasoning_persisted: false,
  };
}

export const AvantiqoCodeProviderV2 = {
  id: PROVIDER_ID,

  async execute(input = {}) {
    const modal = modalConfig();
    if (modal) return executeModal(modal, input);
    return RunpodCodeProvider.execute(input);
  },

  async getStatus(input = {}) {
    const modal = modalConfig();
    if (modal) return getModalStatus(modal, input);
    return RunpodCodeProvider.getStatus(input);
  },
};
