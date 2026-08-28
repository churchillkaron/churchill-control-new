import { request as httpsRequest } from "node:https";

const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
const RUNPOD_REST_BASE = "https://rest.runpod.io/v1";
const CANONICAL_ENDPOINT_NAME = "avantiqo-intelligence-v1";
const DEFAULT_TIMEOUT_MS = 600000;
const DEFAULT_PROBE_TIMEOUT_MS = 25000;
const DEFAULT_HEALTH_TIMEOUT_MS = 20000;
const DEFAULT_EXECUTION_HEALTH_TIMEOUT_MS = 3000;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const DEEP_HTTP_TRANSPORT = "NODE_HTTPS_ABSOLUTE_DEADLINE_V1";
const DEFAULT_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const QWEN3_THINKING_TEMPERATURE = 0.6;
const QWEN3_THINKING_TOP_P = 0.95;
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

function disabled(value) {
  return ["0", "false", "no", "off"].includes(text(value).toLowerCase());
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
    throw new Error("AVANTIQO_INTELLIGENCE_ENDPOINT_INVALID");
  }
  return value;
}

async function discoverEndpointId() {
  if (discoveredEndpointId) return discoveredEndpointId;

  const managementKey =
    text(process.env.RUNPOD_MANAGEMENT_API_KEY) ||
    text(process.env.RUNPOD_API_KEY);
  if (!managementKey) throw new Error("RUNPOD_API_KEY_REQUIRED");

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
      `AVANTIQO_INTELLIGENCE_ENDPOINT_DISCOVERY_FAILED:${response.status}`,
    );
  }

  const endpoints = normalizeListResponse(body, ["endpoints", "serverlessEndpoints"]);
  if (!endpoints) {
    throw new Error("AVANTIQO_INTELLIGENCE_ENDPOINT_LIST_INVALID");
  }
  const matches = endpoints.filter(
    (endpoint) => text(endpoint?.name) === CANONICAL_ENDPOINT_NAME,
  );
  if (matches.length !== 1) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_ENDPOINT_NAME_RESOLUTION_FAILED:name=${CANONICAL_ENDPOINT_NAME}:matches=${matches.length}`,
    );
  }

  discoveredEndpointId = validateEndpointId(matches[0]?.id);
  return discoveredEndpointId;
}

function leasedEndpointId(input = {}) {
  const context = object(input.context);
  const value = text(context.intelligence_safe_lease_endpoint_id);
  return value ? validateEndpointId(value) : null;
}

async function resolveEndpointId(input = {}) {
  const leased = leasedEndpointId(input);
  if (leased) return leased;
  const explicit = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID);
  if (explicit) return validateEndpointId(explicit);
  return discoverEndpointId();
}

async function config(input = {}) {
  const endpointId = await resolveEndpointId(input);
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
  return text(process.env.AVANTIQO_INTELLIGENCE_MODEL) || DEFAULT_MODEL;
}

function isQwen3Thinking2507(model) {
  return text(model) === DEFAULT_MODEL;
}

function samplingFor(model, input = {}) {
  if (isQwen3Thinking2507(model)) {
    return {
      temperature: QWEN3_THINKING_TEMPERATURE,
      top_p: QWEN3_THINKING_TOP_P,
      policy: "QWEN3_THINKING_2507_RECOMMENDED",
    };
  }
  const temperature = Number(input.temperature);
  const topP = Number(input.top_p ?? input.topP);
  return {
    temperature: Number.isFinite(temperature) ? temperature : undefined,
    top_p: Number.isFinite(topP) ? topP : undefined,
    policy: "CALLER_CONTROLLED",
  };
}

function headers(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function redactTransportDetail(value) {
  return text(value)
    .slice(0, 1600)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(
      /((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    );
}

function effectiveRequestTimeoutMs(options = {}) {
  const requested = Number(
    options.requestTimeoutMs ||
      process.env.AVANTIQO_INTELLIGENCE_TIMEOUT_MS ||
      DEFAULT_TIMEOUT_MS,
  );
  return Number.isFinite(requested)
    ? Math.max(1000, requested)
    : DEFAULT_TIMEOUT_MS;
}

async function requestJson(url, options = {}) {
  const target = new URL(url);
  if (target.protocol !== "https:") {
    throw new Error("AVANTIQO_INTELLIGENCE_HTTPS_TRANSPORT_REQUIRED");
  }

  const timeoutMs = effectiveRequestTimeoutMs(options);
  const method = text(options.method || "GET").toUpperCase() || "GET";
  const payload = options.body == null
    ? null
    : typeof options.body === "string"
      ? options.body
      : JSON.stringify(options.body);
  const requestHeaders = { ...object(options.headers) };
  if (payload !== null) {
    requestHeaders["Content-Length"] = Buffer.byteLength(payload);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let deadlineTimer = null;
    let responseRef = null;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      if (deadlineTimer) clearTimeout(deadlineTimer);
      fn(value);
    };

    const failTransport = (error) => {
      const detail = redactTransportDetail(error?.message || error || "unknown error");
      finish(
        reject,
        new Error(`AVANTIQO_INTELLIGENCE_TRANSPORT_FAILED:${detail}`),
      );
    };

    const request = httpsRequest(
      target,
      {
        method,
        headers: requestHeaders,
      },
      (response) => {
        responseRef = response;
        const chunks = [];
        let receivedBytes = 0;

        response.on("data", (chunk) => {
          if (settled) return;
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          receivedBytes += buffer.length;
          if (receivedBytes > MAX_RESPONSE_BYTES) {
            response.destroy(
              new Error(
                `AVANTIQO_INTELLIGENCE_RESPONSE_TOO_LARGE:max_bytes=${MAX_RESPONSE_BYTES}`,
              ),
            );
            return;
          }
          chunks.push(buffer);
        });

        response.on("error", failTransport);
        response.on("end", () => {
          if (settled) return;
          const raw = Buffer.concat(chunks).toString("utf8");
          const body = parseJson(raw);
          const statusCode = Number(response.statusCode || 0);
          if (statusCode < 200 || statusCode >= 300) {
            const detail = redactTransportDetail(
              body?.error?.message || text(raw).slice(0, 1000) || "unknown error",
            );
            finish(
              reject,
              new Error(
                `AVANTIQO_INTELLIGENCE_REQUEST_FAILED:${statusCode}:${detail}`,
              ),
            );
            return;
          }
          if (body === null) {
            finish(
              reject,
              new Error("AVANTIQO_INTELLIGENCE_NON_JSON_TRANSPORT_RESPONSE"),
            );
            return;
          }
          finish(resolve, body);
        });
      },
    );

    request.on("error", failTransport);
    deadlineTimer = setTimeout(() => {
      const error = new Error(
        `AVANTIQO_INTELLIGENCE_HTTP_DEADLINE_EXCEEDED:timeout_ms=${timeoutMs}`,
      );
      request.destroy(error);
      if (responseRef && !responseRef.destroyed) responseRef.destroy(error);
    }, timeoutMs);

    if (payload !== null) request.write(payload);
    request.end();
  });
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

function sanitizedFinalContent(message = {}) {
  const rawContent = typeof message.content === "string" ? message.content : "";
  const hasSeparatedReasoning = Boolean(
    text(message.reasoning_content || message.reasoning),
  );
  const closeIndex = rawContent.lastIndexOf("</think>");
  const openIndex = rawContent.indexOf("<think>");

  if (openIndex >= 0 && closeIndex < 0) {
    throw new Error("AVANTIQO_INTELLIGENCE_TRUNCATED_REASONING_OUTPUT");
  }

  const finalContent = closeIndex >= 0
    ? rawContent.slice(closeIndex + "</think>".length).trim()
    : rawContent.trim();

  if (/<think>|<\/think>/i.test(finalContent)) {
    throw new Error("AVANTIQO_INTELLIGENCE_REASONING_LEAK_DETECTED");
  }

  return {
    content: finalContent,
    reasoningTransportDetected: hasSeparatedReasoning || closeIndex >= 0,
  };
}

function finalMessage(response = {}, { toolsExpected = false } = {}) {
  const choice = response?.choices?.[0] || {};
  const message = choice.message || {};
  const sanitized = sanitizedFinalContent(message);
  const toolCalls = list(message.tool_calls);

  if (
    toolsExpected &&
    !toolCalls.length &&
    /<tool_call>|<function=/i.test(sanitized.content)
  ) {
    throw new Error("AVANTIQO_INTELLIGENCE_TOOL_CALL_PARSER_REQUIRED");
  }

  return {
    choice,
    content: sanitized.content,
    toolCalls,
    reasoningTransportDetected: sanitized.reasoningTransportDetected,
  };
}

async function chatCompletion(input = {}) {
  if (!leasedEndpointId(input)) {
    throw new Error("AVANTIQO_INTELLIGENCE_SAFE_LEASE_ENDPOINT_REQUIRED");
  }
  const { baseUrl, apiKey } = await config(input);
  const model = text(input.model) || configuredModel();
  const messages = normalizeMessages(input);
  if (!messages.length) throw new Error("AVANTIQO_INTELLIGENCE_INPUT_REQUIRED");
  const sampling = samplingFor(model, input);

  return requestJson(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: headers(apiKey),
    requestTimeoutMs: input.request_timeout_ms || input.requestTimeoutMs,
    body: JSON.stringify({
      model,
      messages,
      temperature: sampling.temperature,
      top_p: sampling.top_p,
      max_tokens: Math.max(
        1,
        Number(input.max_output_tokens || input.maxOutputTokens || 8192),
      ),
      tools: input.tools,
      tool_choice: input.tool_choice || input.toolChoice,
      response_format: input.response_format || input.responseFormat,
    }),
  });
}

async function endpointHealth({ timeoutMs = null, input = {} } = {}) {
  const { apiBase, apiKey } = await config(input);
  const startedAt = Date.now();
  const response = await requestJson(`${apiBase}/health`, {
    method: "GET",
    headers: headers(apiKey),
    requestTimeoutMs: Math.max(
      1000,
      Number(
        timeoutMs ||
          process.env.AVANTIQO_INTELLIGENCE_HEALTH_TIMEOUT_MS ||
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

function requireWarmWorker() {
  return enabled(process.env.AVANTIQO_INTELLIGENCE_REQUIRE_WARM_WORKER);
}

async function assertWarmWorkerAvailable(input = {}) {
  if (!requireWarmWorker()) return null;
  const health = await endpointHealth({
    input,
    timeoutMs: Math.max(
      1000,
      Number(
        process.env.AVANTIQO_INTELLIGENCE_EXECUTION_HEALTH_TIMEOUT_MS ||
          DEFAULT_EXECUTION_HEALTH_TIMEOUT_MS,
      ),
    ),
  });
  const warmWorkers = warmWorkerCount(health);
  if (warmWorkers < 1) {
    const initializing = Number(health?.workers?.initializing || 0);
    const queued = Number(health?.jobs?.inQueue || 0);
    throw new Error(
      `AVANTIQO_INTELLIGENCE_WARM_WORKER_REQUIRED:running=${Number(health?.workers?.running || 0)}:idle=${Number(health?.workers?.idle || 0)}:initializing=${initializing}:queued=${queued}`,
    );
  }
  return health;
}

function probeTimeoutMs() {
  return Math.max(
    1000,
    Number(
      process.env.AVANTIQO_INTELLIGENCE_PROBE_TIMEOUT_MS ||
        DEFAULT_PROBE_TIMEOUT_MS,
    ),
  );
}

function toolProbeDefinition() {
  return {
    type: "function",
    function: {
      name: "avantiqo_probe",
      description: "Return the fixed Avantiqo certification payload.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["ok"] },
        },
        required: ["status"],
        additionalProperties: false,
      },
    },
  };
}

function toolProbeSucceeded(toolCalls = []) {
  if (toolCalls.length !== 1) return false;
  const call = toolCalls[0] || {};
  if (text(call?.function?.name) !== "avantiqo_probe") return false;
  const args = parseJson(call?.function?.arguments);
  return object(args).status === "ok";
}

export async function getAvantiqoIntelligenceEndpointHealth() {
  return endpointHealth();
}

export function getAvantiqoIntelligenceRuntimeConfiguration() {
  const endpointConfigured = Boolean(
    text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID),
  );
  const managementKeyConfigured = Boolean(
    text(process.env.RUNPOD_MANAGEMENT_API_KEY) || text(process.env.RUNPOD_API_KEY),
  );
  const apiKeyConfigured = Boolean(text(process.env.RUNPOD_API_KEY));
  const engineEnabled = enabled(process.env.AVANTIQO_INTELLIGENCE_ENGINE_ENABLED);
  const localReviewRuntimeAllowed =
    text(process.env.NODE_ENV).toLowerCase() === "development";
  const endpointResolvable = endpointConfigured || managementKeyConfigured;
  return {
    provider: "avantiqo-intelligence",
    engine_contract: "AVANTIQO_SYNTHETIC_INTELLIGENCE_ENGINE_V1",
    product_model: CANONICAL_ENDPOINT_NAME,
    model: configuredModel(),
    engine_enabled: engineEnabled,
    local_review_runtime_allowed: localReviewRuntimeAllowed,
    endpoint_configured: endpointConfigured,
    endpoint_discovery_configured: managementKeyConfigured,
    api_key_configured: apiKeyConfigured,
    transport: `RUNPOD_OPENAI_COMPATIBLE_${DEEP_HTTP_TRANSPORT}`,
    transport_timeout_ms: DEFAULT_TIMEOUT_MS,
    transport_response_limit_bytes: MAX_RESPONSE_BYTES,
    transport_ambiguous_retry: false,
    runtime_ready:
      apiKeyConfigured &&
      endpointResolvable &&
      (engineEnabled || localReviewRuntimeAllowed),
    warm_worker_required: requireWarmWorker(),
    cold_start_allowed: !requireWarmWorker(),
    safe_lease_endpoint_required_for_inference: true,
    sampling_policy: isQwen3Thinking2507(configuredModel())
      ? "QWEN3_THINKING_2507_RECOMMENDED"
      : "CALLER_CONTROLLED",
    raw_reasoning_persisted: false,
  };
}

export async function probeAvantiqoIntelligenceRuntime({
  health: providedHealth = null,
  input = {},
} = {}) {
  if (!leasedEndpointId(input)) {
    throw new Error("AVANTIQO_INTELLIGENCE_SAFE_LEASE_ENDPOINT_REQUIRED");
  }
  const model = configuredModel();
  const startedAt = Date.now();
  const health = providedHealth || await endpointHealth({ input });
  const timeoutMs = probeTimeoutMs();

  const completionStartedAt = Date.now();
  const response = await chatCompletion({
    ...input,
    model,
    messages: [
      {
        role: "system",
        content:
          "Return only one JSON object. Do not include markdown or explanatory prose.",
      },
      {
        role: "user",
        content:
          '{"status":"ok","engine":"avantiqo-intelligence-v1"}',
      },
    ],
    temperature: 0,
    max_output_tokens: 1024,
    request_timeout_ms: timeoutMs,
    response_format: { type: "json_object" },
  });
  const completionMs = Date.now() - completionStartedAt;
  const normalized = finalMessage(response);
  const finalObject = parseJson(normalized.content);
  const contractOk =
    object(finalObject).status === "ok" &&
    object(finalObject).engine === "avantiqo-intelligence-v1";

  const toolStartedAt = Date.now();
  const toolResponse = await chatCompletion({
    ...input,
    model,
    messages: [
      {
        role: "system",
        content:
          "You are running a transport certification. Use the required tool exactly once and do not answer in prose.",
      },
      {
        role: "user",
        content: "Call avantiqo_probe with status set to ok.",
      },
    ],
    temperature: 0,
    max_output_tokens: 1024,
    request_timeout_ms: timeoutMs,
    tools: [toolProbeDefinition()],
    tool_choice: {
      type: "function",
      function: { name: "avantiqo_probe" },
    },
  });
  const toolMs = Date.now() - toolStartedAt;
  const normalizedTool = finalMessage(toolResponse, { toolsExpected: true });
  const toolCallOk = toolProbeSucceeded(normalizedTool.toolCalls);

  return {
    success: contractOk && toolCallOk,
    provider: "avantiqo-intelligence",
    engine_contract: "AVANTIQO_SYNTHETIC_INTELLIGENCE_ENGINE_V1",
    configured_model: model,
    model_verified_by_completion: contractOk,
    structured_output_ok: contractOk,
    native_tool_call_ok: toolCallOk,
    health_probe_ok: health.success === true,
    health_latency_ms: health.latency_ms,
    health_workers: health.workers,
    health_jobs: health.jobs,
    reasoning_transport_detected:
      normalized.reasoningTransportDetected ||
      normalizedTool.reasoningTransportDetected,
    finish_reason: normalized.choice.finish_reason || null,
    tool_finish_reason: normalizedTool.choice.finish_reason || null,
    usage: normalizedUsage(response),
    tool_usage: normalizedUsage(toolResponse),
    completion_latency_ms: completionMs,
    tool_latency_ms: toolMs,
    total_latency_ms: Date.now() - startedAt,
    sampling_policy: isQwen3Thinking2507(model)
      ? "QWEN3_THINKING_2507_RECOMMENDED"
      : "CALLER_CONTROLLED",
    raw_reasoning_persisted: false,
  };
}

export const AvantiqoIntelligenceProvider = {
  id: "avantiqo-intelligence",

  async execute(input = {}) {
    const context = object(input.context);
    if (
      !text(context.organization_id) ||
      !text(context.organization_service_id) ||
      !text(context.usage_id)
    ) {
      throw new Error("AVANTIQO_INTELLIGENCE_GOVERNED_CONTEXT_REQUIRED");
    }
    if (!leasedEndpointId(input)) {
      throw new Error("AVANTIQO_INTELLIGENCE_SAFE_LEASE_ENDPOINT_REQUIRED");
    }

    await assertWarmWorkerAvailable(input);

    const model = text(input.model) || configuredModel();
    const response = await chatCompletion({ ...input, model });
    const normalized = finalMessage(response, {
      toolsExpected: list(input.tools).length > 0,
    });
    const usage = normalizedUsage(response);
    if (!normalized.content && !normalized.toolCalls.length) {
      const finishReason = text(normalized.choice.finish_reason).toLowerCase() || "unknown";
      if (normalized.reasoningTransportDetected && finishReason === "length") {
        throw new Error(
          `AVANTIQO_INTELLIGENCE_FINAL_ANSWER_BUDGET_EXHAUSTED:finish_reason=length:output_tokens=${usage.output_tokens}`,
        );
      }
      if (normalized.reasoningTransportDetected) {
        throw new Error(
          `AVANTIQO_INTELLIGENCE_FINAL_ANSWER_MISSING_AFTER_REASONING:finish_reason=${finishReason}:output_tokens=${usage.output_tokens}`,
        );
      }
      throw new Error("AVANTIQO_INTELLIGENCE_OUTPUT_REQUIRED");
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
        engine_contract: "AVANTIQO_SYNTHETIC_INTELLIGENCE_ENGINE_V1",
        reasoning_mode: "thinking",
        sampling_policy: isQwen3Thinking2507(model)
          ? "QWEN3_THINKING_2507_RECOMMENDED"
          : "CALLER_CONTROLLED",
        reasoning_transport_detected: normalized.reasoningTransportDetected,
        raw_reasoning_persisted: false,
      },
      usage: {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
      },
    };
  },

  probe: probeAvantiqoIntelligenceRuntime,
};
