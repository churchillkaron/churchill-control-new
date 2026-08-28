import { createAvantiqoOwnedRunpodWorker } from "../avantiqo-owned/AvantiqoOwnedRunpodWorker.js";

const PROVIDER_ID = "avantiqo-code";
const ENGINE_CONTRACT = "AVANTIQO_CODE_ENGINE_V1";
const POD_HTTP_CONTRACT = "AVANTIQO_CODE_POD_HTTP_V3";
const POD_SUBMIT_PATH = "/v3/generations";
const POD_STATUS_PATH = "/v3/generations/{job_id}";
const DEFAULT_MODEL = "avantiqo-code-v1";
const DEFAULT_HTTP_TIMEOUT_MS = 30_000;
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

function podTransportConfig() {
  const baseUrl = text(process.env.AVANTIQO_CODE_POD_BASE_URL).replace(/\/+$/, "");
  const token = text(process.env.AVANTIQO_CODE_POD_TOKEN);
  if (!baseUrl && !token) return null;
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
    timeoutMs: Math.max(
      1_000,
      Number(process.env.AVANTIQO_CODE_POD_HTTP_TIMEOUT_MS || DEFAULT_HTTP_TIMEOUT_MS),
    ),
  };
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

export const AvantiqoCodeProvider = {
  id: PROVIDER_ID,

  async execute(input = {}) {
    const pod = podTransportConfig();
    if (!pod) return serverlessWorker.execute(input);

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
        infrastructure_provider: "RUNPOD_POD_V3",
        pod_http_contract: POD_HTTP_CONTRACT,
        proxy_timeout_safe: true,
        raw_reasoning_persisted: false,
      },
    };
  },

  async getStatus(input = {}) {
    const pod = podTransportConfig();
    if (!pod) return serverlessWorker.getStatus(input);

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
        raw_reasoning_persisted: false,
      };
    }

    if (status === "completed") {
      if (!output || typeof output !== "object") {
        throw new Error("AVANTIQO_CODE_POD_COMPLETED_OUTPUT_REQUIRED");
      }
      if (text(output.provider) !== PROVIDER_ID) {
        throw new Error("AVANTIQO_CODE_POD_COMPLETED_PROVIDER_MISMATCH");
      }
      if (text(output.engine_contract) !== ENGINE_CONTRACT) {
        throw new Error("AVANTIQO_CODE_POD_COMPLETED_ENGINE_CONTRACT_MISMATCH");
      }
      if (output.raw_reasoning_persisted !== false) {
        throw new Error("AVANTIQO_CODE_POD_COMPLETED_REASONING_BOUNDARY_INVALID");
      }
    }

    return {
      status,
      provider_job_id: jobId,
      ...(status === "completed" ? { output } : {}),
      pod_http_contract: POD_HTTP_CONTRACT,
      raw_reasoning_persisted: false,
    };
  },
};
