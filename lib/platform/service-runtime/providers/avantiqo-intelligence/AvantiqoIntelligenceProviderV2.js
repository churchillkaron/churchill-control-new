import { AvantiqoIntelligenceRunpodProvider as RunpodIntelligenceProvider } from "./AvantiqoIntelligenceRunpodProvider.js";

const MODAL_HTTP_CONTRACT = "AVANTIQO_INTELLIGENCE_MODAL_HTTP_V1";
const MODAL_TRANSPORT = "modal-function-call";
const ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_INTELLIGENCE_ENGINE_V2";
const MODAL_JOB_PREFIX = "modal-intelligence:";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const DEEP_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const LANES = new Set(["fast", "deep"]);
const CAPABILITY_DEFAULT_LANE = Object.freeze({
  "ai.reasoning.execute": "deep",
  "ai.text.generate": "fast",
});
const PRIVATE_KEYS = new Set([
  "reasoning", "reasoning_content", "chain_of_thought", "chainofthought",
  "cot", "thoughts", "scratchpad", "analysis",
]);

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function clean(value, depth = 0) {
  if (depth > 10) return "[depth-limited]";
  if (Array.isArray(value)) return value.map((item) => clean(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !PRIVATE_KEYS.has(String(key).toLowerCase()))
      .map(([key, child]) => [key, clean(child, depth + 1)]),
  );
}
function governedContext(input = {}) {
  const context = object(input.context);
  const organizationId = text(context.organization_id);
  const organizationServiceId = text(context.organization_service_id);
  const usageId = text(context.usage_id);
  if (!organizationId || !organizationServiceId || !usageId) {
    throw new Error("AVANTIQO_INTELLIGENCE_GOVERNED_CONTEXT_REQUIRED");
  }
  return { organizationId, organizationServiceId, usageId };
}
function executionLane(input = {}) {
  const explicit = text(input.execution_lane || input.executionLane).toLowerCase();
  const capabilityLane = CAPABILITY_DEFAULT_LANE[text(input.capability).toLowerCase()];
  const lane = explicit || capabilityLane || "deep";
  if (!LANES.has(lane)) throw new Error(`AVANTIQO_INTELLIGENCE_EXECUTION_LANE_INVALID:${lane}`);
  return lane;
}
function modalConfig() {
  const baseUrl = text(process.env.AVANTIQO_INTELLIGENCE_MODAL_BASE_URL).replace(/\/+$/, "");
  const token = text(process.env.AVANTIQO_INTELLIGENCE_MODAL_GATEWAY_TOKEN);
  if (!baseUrl && !token) return null;
  if (!/^https:\/\//i.test(baseUrl)) throw new Error("AVANTIQO_INTELLIGENCE_MODAL_BASE_URL_HTTPS_REQUIRED");
  if (token.length < 40) throw new Error("AVANTIQO_INTELLIGENCE_MODAL_GATEWAY_TOKEN_REQUIRED");
  return {
    baseUrl,
    token,
    timeoutMs: Math.max(1000, Number(process.env.AVANTIQO_INTELLIGENCE_MODAL_HTTP_TIMEOUT_MS || 30000)),
  };
}
async function modalRequest(config, pathname, options = {}) {
  const response = await fetch(`${config.baseUrl}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${config.token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = text(body?.detail || body?.error_code || body?.error_message || raw).slice(0, 800);
    throw new Error(`AVANTIQO_INTELLIGENCE_MODAL_HTTP_${response.status}:${detail || "UNKNOWN"}`);
  }
  if (body?.contract !== MODAL_HTTP_CONTRACT || body?.transport !== MODAL_TRANSPORT) {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_HTTP_CONTRACT_INVALID");
  }
  if (body?.raw_reasoning_persisted !== false) throw new Error("AVANTIQO_INTELLIGENCE_MODAL_REASONING_BOUNDARY_INVALID");
  return body;
}
function modalPayload(input, context, lane) {
  const model = lane === "fast" ? FAST_MODEL : DEEP_MODEL;
  return clean({
    engine_contract: ENGINE_CONTRACT,
    execution_lane: lane,
    capability: text(input.capability),
    model,
    organization_id: context.organizationId,
    usage_id: context.usageId,
    messages: input.messages,
    system_prompt: input.system_prompt || input.systemPrompt || input.instructions_text,
    prompt: input.prompt || input.input || input.text,
    temperature: input.temperature,
    top_p: input.top_p ?? input.topP,
    max_output_tokens: input.max_output_tokens || input.maxOutputTokens,
    tools: input.tools,
    tool_choice: input.tool_choice || input.toolChoice,
    response_format: input.response_format || input.responseFormat,
  });
}
async function executeModal(config, input) {
  const context = governedContext(input);
  const lane = executionLane(input);
  const accepted = await modalRequest(config, "/v1/jobs", {
    method: "POST",
    body: modalPayload(input, context, lane),
  });
  if (accepted.proxy_timeout_safe !== true) throw new Error("AVANTIQO_INTELLIGENCE_MODAL_PROXY_TIMEOUT_SAFE_REQUIRED");
  if (text(accepted.execution_lane) !== lane) throw new Error("AVANTIQO_INTELLIGENCE_MODAL_LANE_MISMATCH");
  const rawJobId = text(accepted.job_id);
  if (!rawJobId) throw new Error("AVANTIQO_INTELLIGENCE_MODAL_JOB_ID_REQUIRED");
  return {
    success: true,
    provider: "avantiqo-intelligence",
    model: lane === "fast" ? FAST_MODEL : DEEP_MODEL,
    output: {
      provider_job_id: `${MODAL_JOB_PREFIX}${rawJobId}`,
      status: "queued",
      engine_contract: ENGINE_CONTRACT,
      execution_lane: lane,
      infrastructure_provider: "MODAL_H100_ASYNC_V1",
      modal_http_contract: MODAL_HTTP_CONTRACT,
      modal_transport: MODAL_TRANSPORT,
      proxy_timeout_safe: true,
      runpod_safe_lease_required: false,
      raw_reasoning_persisted: false,
    },
  };
}
async function getModalStatus(config, rawJobId) {
  const body = await modalRequest(config, `/v1/jobs/${encodeURIComponent(rawJobId)}`);
  const status = text(body.status).toUpperCase();
  const providerJobId = `${MODAL_JOB_PREFIX}${rawJobId}`;
  if (["RUNNING", "QUEUED"].includes(status)) {
    return {
      status: "processing",
      provider_job_id: providerJobId,
      infrastructure_provider: "MODAL_H100_ASYNC_V1",
      raw_reasoning_persisted: false,
    };
  }
  if (status === "FAILED") {
    return {
      status: "failed",
      provider_job_id: providerJobId,
      error: text(body.error_code || body.error_message) || "Avantiqo Intelligence Modal execution failed",
      infrastructure_provider: "MODAL_H100_ASYNC_V1",
      raw_reasoning_persisted: false,
    };
  }
  if (status !== "SUCCEEDED") throw new Error(`AVANTIQO_INTELLIGENCE_MODAL_STATUS_INVALID:${status || "EMPTY"}`);
  const output = clean(body.output || {});
  if (output.status !== "completed") throw new Error("AVANTIQO_INTELLIGENCE_MODAL_COMPLETED_OUTPUT_REQUIRED");
  if (output.provider !== "avantiqo-intelligence") throw new Error("AVANTIQO_INTELLIGENCE_MODAL_PROVIDER_INVALID");
  if (output.engine_contract !== ENGINE_CONTRACT) throw new Error("AVANTIQO_INTELLIGENCE_MODAL_ENGINE_CONTRACT_INVALID");
  if (output.raw_reasoning_persisted !== false) throw new Error("AVANTIQO_INTELLIGENCE_MODAL_REASONING_BOUNDARY_INVALID");
  const usage = object(output.usage);
  return {
    status: "completed",
    provider_job_id: providerJobId,
    output: {
      text: text(output.text),
      tool_calls: Array.isArray(output.tool_calls) ? output.tool_calls : [],
      finish_reason: output.finish_reason || null,
      usage,
      engine_contract: ENGINE_CONTRACT,
      execution_lane: output.execution_lane,
      reasoning_mode: output.reasoning_mode,
      sampling_policy: output.sampling_policy,
      reasoning_transport_detected: output.reasoning_transport_detected === true,
      infrastructure_provider: "MODAL_H100_ASYNC_V1",
      raw_reasoning_persisted: false,
    },
    usage: {
      input_tokens: Number(usage.input_tokens || 0),
      output_tokens: Number(usage.output_tokens || 0),
    },
    raw_reasoning_persisted: false,
  };
}

export const AvantiqoIntelligenceProviderV2 = {
  id: "avantiqo-intelligence",
  async execute(input = {}) {
    const config = modalConfig();
    if (config) return executeModal(config, input);
    return RunpodIntelligenceProvider.execute(input);
  },
  async getStatus(input = {}) {
    const jobId = text(input.job_id || input.jobId || input.provider_job_id);
    if (!jobId) throw new Error("AVANTIQO_INTELLIGENCE_JOB_ID_REQUIRED");
    if (!jobId.startsWith(MODAL_JOB_PREFIX)) {
      throw new Error("AVANTIQO_INTELLIGENCE_RUNPOD_PROVIDER_IS_SYNCHRONOUS");
    }
    const config = modalConfig();
    if (!config) throw new Error("AVANTIQO_INTELLIGENCE_MODAL_CONFIGURATION_REQUIRED_FOR_JOB");
    const rawJobId = jobId.slice(MODAL_JOB_PREFIX.length);
    if (!rawJobId) throw new Error("AVANTIQO_INTELLIGENCE_MODAL_JOB_ID_REQUIRED");
    return getModalStatus(config, rawJobId);
  },
};

export const AVANTIQO_INTELLIGENCE_MODAL_JOB_PREFIX = MODAL_JOB_PREFIX;
