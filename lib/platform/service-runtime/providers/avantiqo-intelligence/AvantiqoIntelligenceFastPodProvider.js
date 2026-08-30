import {
  withOwnedIntelligenceFastPodFallback,
} from "../../execution/OwnedIntelligenceFastPodFallbackRuntime";

const PROVIDER = "avantiqo-intelligence";
const MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_POD_PROVIDER_V1";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeMessages(input = {}) {
  if (list(input.messages).length) return input.messages;
  const messages = [];
  const system = text(input.system_prompt || input.systemPrompt || input.instructions_text);
  const prompt = text(input.prompt || input.input || input.text);
  if (system) messages.push({ role: "system", content: system });
  if (prompt) messages.push({ role: "user", content: prompt });
  return messages;
}

function normalizedUsage(response = {}) {
  return {
    input_tokens: Number(
      response?.usage?.prompt_tokens ?? response?.usage?.input_tokens ?? response?.usage?.input ?? 0,
    ),
    output_tokens: Number(
      response?.usage?.completion_tokens ?? response?.usage?.output_tokens ?? response?.usage?.output ?? 0,
    ),
    total_tokens: Number(response?.usage?.total_tokens ?? 0),
  };
}

function finalMessage(response = {}, { toolsExpected = false } = {}) {
  const choice = response?.choices?.[0] || {};
  const message = choice.message || {};
  const content = typeof message.content === "string" ? message.content.trim() : "";
  const reasoning = text(message.reasoning_content || message.reasoning);
  if (reasoning || /<think>|<\/think>/i.test(content)) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_REASONING_TRANSPORT_FORBIDDEN");
  }
  const toolCalls = list(message.tool_calls);
  if (toolsExpected && !toolCalls.length && /<tool_call>|<function=/i.test(content)) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_TOOL_CALL_PARSER_REQUIRED");
  }
  return { choice, content, toolCalls };
}

function requestTimeoutMs(input = {}) {
  const value = Number(
    input.request_timeout_ms ||
    input.requestTimeoutMs ||
    process.env.AVANTIQO_INTELLIGENCE_FAST_TIMEOUT_MS ||
    360000,
  );
  return Math.max(30000, Math.min(600000, Number.isFinite(value) ? value : 360000));
}

async function executeOnReadyPod(baseUrl, input = {}) {
  const messages = normalizeMessages(input);
  if (!messages.length) throw new Error("AVANTIQO_INTELLIGENCE_FAST_INPUT_REQUIRED");
  const temperature = Number(input.temperature);
  const topP = Number(input.top_p ?? input.topP);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: Number.isFinite(temperature) ? temperature : 0.2,
      top_p: Number.isFinite(topP) ? topP : 0.8,
      max_tokens: Math.max(1, Number(input.max_output_tokens || input.maxOutputTokens || 2200)),
      tools: input.tools,
      tool_choice: input.tool_choice || input.toolChoice,
      response_format: input.response_format || input.responseFormat,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(requestTimeoutMs(input)),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.error?.message || body?.message || raw).slice(0, 1000);
    throw new Error(`AVANTIQO_INTELLIGENCE_FAST_POD_REQUEST_FAILED:${response.status}:${detail}`);
  }
  if (!body || typeof body !== "object") {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_POD_NON_JSON_TRANSPORT_RESPONSE");
  }
  return body;
}

export async function executeAvantiqoIntelligenceFastPodProvider(options = {}) {
  const context = object(options?.context);
  if (
    !text(context.organization_id) ||
    !text(context.organization_service_id) ||
    !text(context.usage_id)
  ) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_GOVERNED_CONTEXT_REQUIRED");
  }
  const input = {
    ...(options?.input && typeof options.input === "object" ? options.input : {}),
    context,
  };

  return withOwnedIntelligenceFastPodFallback({
    execute: async (podContext) => {
      const response = await executeOnReadyPod(podContext.intelligence_fast_pod_base_url, input);
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
        provider: PROVIDER,
        model: MODEL,
        output: {
          text: normalized.content,
          tool_calls: normalized.toolCalls,
          finish_reason: normalized.choice.finish_reason || null,
          usage,
          engine_contract: "AVANTIQO_SYNTHETIC_INTELLIGENCE_ENGINE_V2",
          execution_lane: "fast",
          reasoning_mode: "non_thinking",
          sampling_policy: "CALLER_CONTROLLED_INSTRUCT_2507",
          transport: "RUNPOD_EPHEMERAL_POD_OPENAI_COMPATIBLE",
          scheduling: {
            policy: "SERVERLESS_UNSCHEDULED_THEN_EPHEMERAL_POD_V1",
            serverless_parked_before_pod: true,
            pod_runtime_ready: true,
            pod_startup_ms: podContext.intelligence_fast_pod_startup_ms,
          },
          pod_fallback_contract: podContext.intelligence_fast_pod_fallback_contract,
          reasoning_transport_detected: false,
          raw_reasoning_persisted: false,
        },
        usage: {
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
        },
      };
    },
  });
}

export const AvantiqoIntelligenceFastPodProvider = Object.freeze({
  id: PROVIDER,
  contract: CONTRACT,
  model: MODEL,
  execute: executeAvantiqoIntelligenceFastPodProvider,
});

export default AvantiqoIntelligenceFastPodProvider;
