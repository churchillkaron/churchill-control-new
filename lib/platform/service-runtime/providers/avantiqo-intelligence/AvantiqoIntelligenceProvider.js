const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
const DEFAULT_TIMEOUT_MS = 300000;
const DEFAULT_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

function config() {
  const endpointId = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID);
  const apiKey = text(process.env.RUNPOD_API_KEY);
  if (!endpointId) throw new Error("RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID_REQUIRED");
  if (!apiKey) throw new Error("RUNPOD_API_KEY_REQUIRED");
  return { endpointId, apiKey, baseUrl: `${RUNPOD_API_BASE}/${endpointId}/openai/v1` };
}

function headers(apiKey) {
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" };
}

async function postJson(url, options) {
  const controller = new AbortController();
  const timeoutMs = Math.max(1000, Number(process.env.AVANTIQO_INTELLIGENCE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS));
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const raw = await response.text();
    const body = raw ? JSON.parse(raw) : {};
    if (!response.ok) throw new Error(`AVANTIQO_INTELLIGENCE_REQUEST_FAILED:${response.status}:${body?.error?.message || raw}`);
    return body;
  } finally { clearTimeout(timer); }
}

function normalizeMessages(input = {}) {
  if (list(input.messages).length) return input.messages;
  const system = text(input.system_prompt || input.systemPrompt || input.instructions_text);
  const prompt = text(input.prompt || input.input || input.text);
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  if (prompt) messages.push({ role: "user", content: prompt });
  return messages;
}

export const AvantiqoIntelligenceProvider = {
  id: "avantiqo-intelligence",
  async execute(input = {}) {
    const context = object(input.context);
    if (!text(context.organization_id) || !text(context.organization_service_id) || !text(context.usage_id)) {
      throw new Error("AVANTIQO_INTELLIGENCE_GOVERNED_CONTEXT_REQUIRED");
    }
    const { baseUrl, apiKey } = config();
    const model = text(input.model || process.env.AVANTIQO_INTELLIGENCE_MODEL) || DEFAULT_MODEL;
    const messages = normalizeMessages(input);
    if (!messages.length) throw new Error("AVANTIQO_INTELLIGENCE_INPUT_REQUIRED");
    const response = await postJson(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify({
        model,
        messages,
        temperature: Number.isFinite(Number(input.temperature)) ? Number(input.temperature) : undefined,
        max_tokens: Number(input.max_output_tokens || input.maxOutputTokens || 8192),
        tools: input.tools,
        tool_choice: input.tool_choice || input.toolChoice,
        response_format: input.response_format || input.responseFormat,
      }),
    });
    const choice = response?.choices?.[0] || {};
    const message = choice.message || {};
    const content = typeof message.content === "string" ? message.content : "";
    if (!content && !list(message.tool_calls).length) throw new Error("AVANTIQO_INTELLIGENCE_OUTPUT_REQUIRED");
    return {
      success: true,
      provider: "avantiqo-intelligence",
      model,
      output: {
        text: content,
        tool_calls: list(message.tool_calls),
        finish_reason: choice.finish_reason || null,
        usage: {
          input_tokens: Number(response?.usage?.prompt_tokens || 0),
          output_tokens: Number(response?.usage?.completion_tokens || 0),
          total_tokens: Number(response?.usage?.total_tokens || 0),
        },
        engine_contract: "AVANTIQO_SYNTHETIC_INTELLIGENCE_ENGINE_V1",
        reasoning_mode: "thinking",
        raw_reasoning_persisted: false,
      },
      usage: {
        input_tokens: Number(response?.usage?.prompt_tokens || 0),
        output_tokens: Number(response?.usage?.completion_tokens || 0),
      },
    };
  },
};
