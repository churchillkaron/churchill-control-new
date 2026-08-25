const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
const RUNPOD_REST_BASE = "https://rest.runpod.io/v1";
const CANONICAL_ENDPOINT_NAME = "avantiqo-intelligence-fast-v1";
const DEFAULT_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const DEFAULT_TIMEOUT_MS = 90000;
const DEFAULT_HEALTH_TIMEOUT_MS = 15000;
let discoveredEndpointId = "";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

function parseJson(raw) {
  const source = text(raw);
  if (!source) return {};
  try {
    return JSON.parse(source);
  } catch {
    return null;
  }
}

function normalizeListResponse(value, candidateKeys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...candidateKeys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const normalized = normalizeListResponse(value[key], candidateKeys, depth + 1);
    if (normalized) return normalized;
  }
  return null;
}

function validateEndpointId(endpointId) {
  const value = text(endpointId);
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_INVALID");
  }
  return value;
}

async function discoverEndpointId() {
  if (discoveredEndpointId) return discoveredEndpointId;
  const managementKey =
    text(process.env.RUNPOD_MANAGEMENT_API_KEY) ||
    text(process.env.RUNPOD_API_KEY);
  if (!managementKey) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_DISCOVERY_CREDENTIAL_REQUIRED");
  }
  const response = await fetch(
    `${RUNPOD_REST_BASE}/endpoints?includeTemplate=false&includeWorkers=false`,
    {
      headers: {
        Authorization: `Bearer ${managementKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30000),
    },
  );
  const raw = await response.text();
  const body = parseJson(raw);
  if (!response.ok) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_DISCOVERY_FAILED:${response.status}`,
    );
  }
  const endpoints = normalizeListResponse(body, ["endpoints", "serverlessEndpoints"]);
  if (!endpoints) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_LIST_INVALID");
  }
  const matches = endpoints.filter(
    (endpoint) => text(endpoint?.name) === CANONICAL_ENDPOINT_NAME,
  );
  if (matches.length !== 1) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_NAME_RESOLUTION_FAILED:name=${CANONICAL_ENDPOINT_NAME}:matches=${matches.length}`,
    );
  }
  discoveredEndpointId = validateEndpointId(matches[0]?.id);
  return discoveredEndpointId;
}

async function resolveEndpointId() {
  const explicit = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_ID);
  if (explicit) return validateEndpointId(explicit);
  return discoverEndpointId();
}

async function config() {
  const endpointId = await resolveEndpointId();
  const apiKey = text(process.env.RUNPOD_API_KEY);
  if (!apiKey) throw new Error("RUNPOD_API_KEY_REQUIRED");
  return {
    endpointId,
    apiKey,
    apiBase: `${RUNPOD_API_BASE}/${endpointId}`,
    baseUrl: `${RUNPOD_API_BASE}/${endpointId}/openai/v1`,
  };
}

function configuredModel() {
  return text(process.env.AVANTIQO_INTELLIGENCE_FAST_MODEL) || DEFAULT_MODEL;
}

function headers(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Math.max(
    1000,
    Number(
      options.requestTimeoutMs ||
        process.env.AVANTIQO_INTELLIGENCE_FAST_TIMEOUT_MS ||
        DEFAULT_TIMEOUT_MS,
    ),
  );
  const { requestTimeoutMs: _requestTimeoutMs, ...fetchOptions } = options;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
    const raw = await response.text();
    const body = parseJson(raw);
    if (!response.ok) {
      const detail =
        body?.error?.message || text(raw).slice(0, 1000) || "unknown error";
      throw new Error(
        `AVANTIQO_INTELLIGENCE_FAST_REQUEST_FAILED:${response.status}:${detail}`,
      );
    }
    if (body === null) {
      throw new Error("AVANTIQO_INTELLIGENCE_FAST_NON_JSON_TRANSPORT_RESPONSE");
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeMessages(input = {}) {
  if (list(input.messages).length) return input.messages;
  const system = text(
    input.system_prompt || input.systemPrompt || input.instructions_text,
  );
  const prompt = text(input.prompt || input.input || input.text);
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  if (prompt) messages.push({ role: "user", content: prompt });
  return messages;
}

function normalizedUsage(response = {}) {
  return {
    input_tokens: Number(response?.usage?.prompt_tokens || 0),
    output_tokens: Number(response?.usage?.completion_tokens || 0),
    total_tokens: Number(response?.usage?.total_tokens || 0),
  };
}

function finalMessage(response = {}, { toolsExpected = false } = {}) {
  const choice = response?.choices?.[0] || {};
  const message = choice.message || {};
  const rawContent = typeof message.content === "string" ? message.content.trim() : "";
  const reasoning = text(message.reasoning_content || message.reasoning);
  if (reasoning || /<think>|<\/think>/i.test(rawContent)) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_REASONING_TRANSPORT_FORBIDDEN");
  }
  const toolCalls = list(message.tool_calls);
  if (
    toolsExpected &&
    !toolCalls.length &&
    /<tool_call>|<function=/i.test(rawContent)
  ) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_TOOL_CALL_PARSER_REQUIRED");
  }
  return {
    choice,
    content: rawContent,
    toolCalls,
  };
}

async function chatCompletion(input = {}) {
  const { baseUrl, apiKey } = await config();
  const model = configuredModel();
  const messages = normalizeMessages(input);
  if (!messages.length) throw new Error("AVANTIQO_INTELLIGENCE_FAST_INPUT_REQUIRED");
  const temperature = Number(input.temperature);
  const topP = Number(input.top_p ?? input.topP);
  return requestJson(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: headers(apiKey),
    requestTimeoutMs: input.request_timeout_ms || input.requestTimeoutMs,
    body: JSON.stringify({
      model,
      messages,
      temperature: Number.isFinite(temperature) ? temperature : 0.2,
      top_p: Number.isFinite(topP) ? topP : 0.8,
      max_tokens: Math.max(
        1,
        Number(input.max_output_tokens || input.maxOutputTokens || 2200),
      ),
      tools: input.tools,
      tool_choice: input.tool_choice || input.toolChoice,
      response_format: input.response_format || input.responseFormat,
    }),
  });
}

async function endpointHealth({ timeoutMs = null } = {}) {
  const { apiBase, apiKey } = await config();
  const startedAt = Date.now();
  const response = await requestJson(`${apiBase}/health`, {
    method: "GET",
    headers: headers(apiKey),
    requestTimeoutMs: Math.max(
      1000,
      Number(
        timeoutMs ||
          process.env.AVANTIQO_INTELLIGENCE_FAST_HEALTH_TIMEOUT_MS ||
          DEFAULT_HEALTH_TIMEOUT_MS,
      ),
    ),
  });
  return {
    success: true,
    latency_ms: Date.now() - startedAt,
    workers: object(response?.workers),
    jobs: object(response?.jobs),
  };
}

function warmWorkerCount(health = {}) {
  return Number(health?.workers?.running || 0) + Number(health?.workers?.idle || 0);
}

async function assertWarmWorkerAvailable() {
  if (!enabled(process.env.AVANTIQO_INTELLIGENCE_FAST_REQUIRE_WARM_WORKER)) {
    return null;
  }
  const health = await endpointHealth();
  if (warmWorkerCount(health) < 1) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_FAST_WARM_WORKER_REQUIRED:running=${Number(health?.workers?.running || 0)}:idle=${Number(health?.workers?.idle || 0)}:initializing=${Number(health?.workers?.initializing || 0)}:queued=${Number(health?.jobs?.inQueue || 0)}`,
    );
  }
  return health;
}

export async function getAvantiqoIntelligenceFastEndpointHealth() {
  return endpointHealth();
}

export function getAvantiqoIntelligenceFastRuntimeConfiguration() {
  const endpointConfigured = Boolean(
    text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_ID),
  );
  const managementKeyConfigured = Boolean(
    text(process.env.RUNPOD_MANAGEMENT_API_KEY) || text(process.env.RUNPOD_API_KEY),
  );
  const apiKeyConfigured = Boolean(text(process.env.RUNPOD_API_KEY));
  const endpointResolvable = endpointConfigured || managementKeyConfigured;
  return {
    provider: "avantiqo-intelligence",
    execution_lane: "fast",
    product_model: CANONICAL_ENDPOINT_NAME,
    model: configuredModel(),
    endpoint_configured: endpointConfigured,
    endpoint_discovery_configured: managementKeyConfigured,
    api_key_configured: apiKeyConfigured,
    transport: "RUNPOD_OPENAI_COMPATIBLE",
    runtime_ready: apiKeyConfigured && endpointResolvable,
    reasoning_mode: "NON_THINKING_ONLY",
    sampling_policy: "CALLER_CONTROLLED_INSTRUCT_2507",
    raw_reasoning_persisted: false,
  };
}

export const AvantiqoIntelligenceFastProvider = {
  id: "avantiqo-intelligence",

  async execute(input = {}) {
    const context = object(input.context);
    if (
      !text(context.organization_id) ||
      !text(context.organization_service_id) ||
      !text(context.usage_id)
    ) {
      throw new Error("AVANTIQO_INTELLIGENCE_FAST_GOVERNED_CONTEXT_REQUIRED");
    }
    await assertWarmWorkerAvailable();
    const model = configuredModel();
    const response = await chatCompletion(input);
    const normalized = finalMessage(response, {
      toolsExpected: list(input.tools).length > 0,
    });
    const usage = normalizedUsage(response);
    if (!normalized.content && !normalized.toolCalls.length) {
      const finishReason = text(normalized.choice.finish_reason).toLowerCase() || "unknown";
      throw new Error(
        `AVANTIQO_INTELLIGENCE_FAST_OUTPUT_REQUIRED:finish_reason=${finishReason}:output_tokens=${usage.output_tokens}`,
      );
    }
    return {
      success: true,
      provider: "avantiqo-intelligence",
      model,
      output: {
        text: normalized.content,
        tool_calls: normalized.toolCalls,
        finish_reason: normalized.choice.finish_reason || null,
        usage,
        engine_contract: "AVANTIQO_SYNTHETIC_INTELLIGENCE_ENGINE_V2",
        execution_lane: "fast",
        reasoning_mode: "non_thinking",
        sampling_policy: "CALLER_CONTROLLED_INSTRUCT_2507",
        reasoning_transport_detected: false,
        raw_reasoning_persisted: false,
      },
      usage: {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
      },
    };
  },
};

export const AVANTIQO_INTELLIGENCE_FAST_MODEL = DEFAULT_MODEL;
export const AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_NAME = CANONICAL_ENDPOINT_NAME;
