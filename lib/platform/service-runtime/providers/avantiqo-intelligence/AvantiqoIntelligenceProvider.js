const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
const DEFAULT_TIMEOUT_MS = 300000;
const DEFAULT_PROBE_TIMEOUT_MS = 180000;
const DEFAULT_HEALTH_TIMEOUT_MS = 20000;
const DEFAULT_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";

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

function config() {
  const endpointId = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID);
  const apiKey = text(process.env.RUNPOD_API_KEY);
  if (!endpointId) {
    throw new Error("RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID_REQUIRED");
  }
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
        process.env.AVANTIQO_INTELLIGENCE_TIMEOUT_MS ||
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
        `AVANTIQO_INTELLIGENCE_REQUEST_FAILED:${response.status}:${detail}`,
      );
    }
    if (body === null) {
      throw new Error("AVANTIQO_INTELLIGENCE_NON_JSON_TRANSPORT_RESPONSE");
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
    message,
    content: sanitized.content,
    toolCalls,
    reasoningTransportDetected: sanitized.reasoningTransportDetected,
  };
}

async function chatCompletion(input = {}) {
  const { baseUrl, apiKey } = config();
  const model = text(input.model) || configuredModel();
  const messages = normalizeMessages(input);
  if (!messages.length) throw new Error("AVANTIQO_INTELLIGENCE_INPUT_REQUIRED");

  return requestJson(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: headers(apiKey),
    requestTimeoutMs: input.request_timeout_ms || input.requestTimeoutMs,
    body: JSON.stringify({
      model,
      messages,
      temperature: Number.isFinite(Number(input.temperature))
        ? Number(input.temperature)
        : undefined,
      top_p: Number.isFinite(Number(input.top_p || input.topP))
        ? Number(input.top_p || input.topP)
        : undefined,
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

async function endpointHealth() {
  const { apiBase, apiKey } = config();
  const startedAt = Date.now();
  const response = await requestJson(`${apiBase}/health`, {
    method: "GET",
    headers: headers(apiKey),
    requestTimeoutMs: Math.max(
      1000,
      Number(
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

export function getAvantiqoIntelligenceRuntimeConfiguration() {
  const endpointConfigured = Boolean(
    text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID),
  );
  const apiKeyConfigured = Boolean(text(process.env.RUNPOD_API_KEY));
  const engineEnabled = enabled(process.env.AVANTIQO_INTELLIGENCE_ENGINE_ENABLED);
  return {
    provider: "avantiqo-intelligence",
    engine_contract: "AVANTIQO_SYNTHETIC_INTELLIGENCE_ENGINE_V1",
    model: configuredModel(),
    engine_enabled: engineEnabled,
    endpoint_configured: endpointConfigured,
    api_key_configured: apiKeyConfigured,
    transport: "RUNPOD_OPENAI_COMPATIBLE",
    runtime_ready: engineEnabled && endpointConfigured && apiKeyConfigured,
    raw_reasoning_persisted: false,
  };
}

export async function probeAvantiqoIntelligenceRuntime() {
  const model = configuredModel();
  const startedAt = Date.now();
  const health = await endpointHealth();
  const timeoutMs = probeTimeoutMs();

  const completionStartedAt = Date.now();
  const response = await chatCompletion({
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
          'Return exactly this semantic result: {"status":"ok","engine":"avantiqo-intelligence-v1"}.',
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

    const model = text(input.model) || configuredModel();
    const response = await chatCompletion({ ...input, model });
    const normalized = finalMessage(response, {
      toolsExpected: list(input.tools).length > 0,
    });
    if (!normalized.content && !normalized.toolCalls.length) {
      throw new Error("AVANTIQO_INTELLIGENCE_OUTPUT_REQUIRED");
    }
    const usage = normalizedUsage(response);

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
