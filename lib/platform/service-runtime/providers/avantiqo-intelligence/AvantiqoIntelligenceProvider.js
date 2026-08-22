const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
const DEFAULT_TIMEOUT_MS = 300000;
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
    Number(process.env.AVANTIQO_INTELLIGENCE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  );
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const raw = await response.text();
    const body = parseJson(raw);
    if (!response.ok) {
      const detail = body?.error?.message || text(raw).slice(0, 1000) || "unknown error";
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

function servedModelIds(response = {}) {
  return list(response?.data)
    .map((item) => text(item?.id))
    .filter(Boolean);
}

function finalMessage(response = {}) {
  const choice = response?.choices?.[0] || {};
  const message = choice.message || {};
  return {
    choice,
    message,
    content: typeof message.content === "string" ? message.content : "",
    toolCalls: list(message.tool_calls),
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
    body: JSON.stringify({
      model,
      messages,
      temperature: Number.isFinite(Number(input.temperature))
        ? Number(input.temperature)
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

export function getAvantiqoIntelligenceRuntimeConfiguration() {
  const endpointConfigured = Boolean(
    text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID),
  );
  const apiKeyConfigured = Boolean(text(process.env.RUNPOD_API_KEY));
  return {
    provider: "avantiqo-intelligence",
    engine_contract: "AVANTIQO_SYNTHETIC_INTELLIGENCE_ENGINE_V1",
    model: configuredModel(),
    endpoint_configured: endpointConfigured,
    api_key_configured: apiKeyConfigured,
    transport: "RUNPOD_OPENAI_COMPATIBLE",
    runtime_ready: endpointConfigured && apiKeyConfigured,
    raw_reasoning_persisted: false,
  };
}

export async function probeAvantiqoIntelligenceRuntime() {
  const { baseUrl, apiKey } = config();
  const model = configuredModel();
  const startedAt = Date.now();

  let models = [];
  let modelsProbeError = null;
  try {
    const modelsResponse = await requestJson(`${baseUrl}/models`, {
      method: "GET",
      headers: headers(apiKey),
    });
    models = servedModelIds(modelsResponse);
  } catch (error) {
    modelsProbeError = text(error?.message || error).slice(0, 1000) || null;
  }

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
    response_format: { type: "json_object" },
  });
  const completionMs = Date.now() - completionStartedAt;
  const normalized = finalMessage(response);
  const finalObject = parseJson(normalized.content);
  const contractOk =
    object(finalObject).status === "ok" &&
    object(finalObject).engine === "avantiqo-intelligence-v1";
  const modelMatch = models.length ? models.includes(model) : null;

  return {
    success: contractOk,
    provider: "avantiqo-intelligence",
    engine_contract: "AVANTIQO_SYNTHETIC_INTELLIGENCE_ENGINE_V1",
    configured_model: model,
    served_models: models.slice(0, 20),
    model_match: modelMatch,
    models_probe_error: modelsProbeError,
    structured_output_ok: contractOk,
    finish_reason: normalized.choice.finish_reason || null,
    usage: normalizedUsage(response),
    completion_latency_ms: completionMs,
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
    const normalized = finalMessage(response);
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
