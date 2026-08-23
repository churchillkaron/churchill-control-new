import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  createIntelligenceToolRegistry,
} from "./IntelligenceToolRegistry";

const CONTRACT = "AVANTIQO_INTELLIGENCE_REASONING_LOOP_V1";
const OWNED_PROVIDER = "avantiqo-intelligence";
const REASONING_CAPABILITY = "ai.reasoning.execute";
const DEFAULT_MAX_TURNS = 8;
const MAX_TURNS = 20;
const DEFAULT_MAX_TOOL_CALLS = 16;
const MAX_TOOL_CALLS = 64;
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function boundedInteger(value, fallback, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) return fallback;
  return Math.min(number, maximum);
}

function parseArguments(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  const source = text(raw);
  if (!source) return {};
  try {
    const parsed = JSON.parse(source);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("arguments must be a JSON object");
    }
    return parsed;
  } catch (error) {
    const wrapped = new Error("AVANTIQO_INTELLIGENCE_TOOL_ARGUMENTS_INVALID_JSON");
    wrapped.cause = error;
    throw wrapped;
  }
}

function outputEnvelope(execution = {}) {
  const first = object(execution?.output);
  const second = object(first.output);
  return Object.keys(second).length ? second : first;
}

function toolCallsFrom(execution = {}) {
  return list(outputEnvelope(execution).tool_calls);
}

function finalTextFrom(execution = {}) {
  return text(outputEnvelope(execution).text);
}

function finishReasonFrom(execution = {}) {
  return text(outputEnvelope(execution).finish_reason) || null;
}

function assistantToolCallMessage(toolCalls) {
  return {
    role: "assistant",
    content: null,
    tool_calls: toolCalls.map((call) => ({
      id: text(call?.id) || undefined,
      type: "function",
      function: {
        name: text(call?.function?.name),
        arguments: typeof call?.function?.arguments === "string"
          ? call.function.arguments
          : JSON.stringify(object(call?.function?.arguments)),
      },
    })),
  };
}

function stableJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({
      ok: false,
      code: "AVANTIQO_INTELLIGENCE_TOOL_RESULT_NOT_SERIALIZABLE",
    });
  }
}

function toolResultMessage(call, result, maxChars = 24000) {
  const serialized = stableJson(result);
  const content = serialized.length > maxChars
    ? `${serialized.slice(0, maxChars)}\n[TRUNCATED]`
    : serialized;
  return {
    role: "tool",
    tool_call_id: text(call?.id) || undefined,
    name: text(call?.function?.name) || undefined,
    content,
  };
}

function normalizeMessages({ system, messages, input }) {
  const normalized = [];
  if (text(system)) normalized.push({ role: "system", content: text(system) });
  for (const message of list(messages)) {
    if (!message || typeof message !== "object") continue;
    normalized.push({ ...message });
  }
  if (!normalized.length && text(input)) {
    normalized.push({ role: "user", content: text(input) });
  }
  return normalized;
}

function normalizeRegistry(tools) {
  if (tools && typeof tools.descriptors === "function" && typeof tools.execute === "function") {
    return tools;
  }
  return createIntelligenceToolRegistry(list(tools));
}

function validateScope({ organization_id, messages }) {
  if (!text(organization_id)) {
    throw new Error("AVANTIQO_INTELLIGENCE_ORGANIZATION_SCOPE_REQUIRED");
  }
  if (!messages.length) {
    throw new Error("AVANTIQO_INTELLIGENCE_REASONING_INPUT_REQUIRED");
  }
}

export async function runIntelligenceReasoningLoop({
  organization_id,
  party_id = null,
  entity_id = null,
  messages = [],
  input = null,
  system = null,
  tools = [],
  authorization = {},
  metadata = {},
  model = null,
  temperature = 0.2,
  response_format = null,
  max_output_tokens = DEFAULT_MAX_OUTPUT_TOKENS,
  max_turns = DEFAULT_MAX_TURNS,
  max_tool_calls = DEFAULT_MAX_TOOL_CALLS,
} = {}) {
  const conversation = normalizeMessages({ system, messages, input });
  validateScope({ organization_id, messages: conversation });

  const registry = normalizeRegistry(tools);
  const toolDescriptors = registry.descriptors();
  const turnLimit = boundedInteger(max_turns, DEFAULT_MAX_TURNS, MAX_TURNS);
  const toolCallLimit = boundedInteger(max_tool_calls, DEFAULT_MAX_TOOL_CALLS, MAX_TOOL_CALLS);
  const seenCallIds = new Set();
  const transcript = [];
  let totalToolCalls = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let turn = 1; turn <= turnLimit; turn += 1) {
    const execution = await ServiceExecutionRuntime.execute({
      organization_id,
      party_id,
      entity_id,
      service_id: REASONING_CAPABILITY,
      provider_id: OWNED_PROVIDER,
      capability: REASONING_CAPABILITY,
      provider_policy: {
        allowed_providers: [OWNED_PROVIDER],
      },
      input: {
        ...(model ? { model } : {}),
        messages: conversation,
        ...(toolDescriptors.length ? { tools: toolDescriptors, tool_choice: "auto" } : {}),
        ...(response_format ? { response_format: object(response_format) } : {}),
        temperature,
        max_output_tokens,
      },
      metadata: {
        ...object(metadata),
        module: object(metadata).module || "INTELLIGENCE",
        operation: "AVANTIQO_INTELLIGENCE_REASONING_LOOP",
        intelligence_contract: CONTRACT,
        reasoning_turn: turn,
      },
      category: "AI",
    });

    const output = outputEnvelope(execution);
    totalInputTokens += Number(output?.usage?.input_tokens || execution?.usage?.input_tokens || 0);
    totalOutputTokens += Number(output?.usage?.output_tokens || execution?.usage?.output_tokens || 0);
    const calls = toolCallsFrom(execution);
    const finalText = finalTextFrom(execution);

    transcript.push({
      turn,
      provider: execution?.provider || OWNED_PROVIDER,
      model: execution?.model || model || null,
      finish_reason: finishReasonFrom(execution),
      tool_calls: calls.map((call) => ({
        id: text(call?.id) || null,
        name: text(call?.function?.name) || null,
      })),
      text_present: Boolean(finalText),
    });

    if (!calls.length) {
      if (!finalText) {
        throw new Error("AVANTIQO_INTELLIGENCE_REASONING_LOOP_EMPTY_FINAL_OUTPUT");
      }
      return {
        success: true,
        contract: CONTRACT,
        organization_id,
        provider: execution?.provider || OWNED_PROVIDER,
        model: execution?.model || model || null,
        text: finalText,
        finish_reason: finishReasonFrom(execution),
        turns: turn,
        tool_calls_executed: totalToolCalls,
        usage: {
          input_tokens: totalInputTokens,
          output_tokens: totalOutputTokens,
        },
        transcript,
      };
    }

    if (totalToolCalls + calls.length > toolCallLimit) {
      throw new Error("AVANTIQO_INTELLIGENCE_TOOL_CALL_LIMIT_EXCEEDED");
    }

    conversation.push(assistantToolCallMessage(calls));

    for (const call of calls) {
      const callId = text(call?.id);
      const toolName = text(call?.function?.name);
      if (!toolName) {
        throw new Error("AVANTIQO_INTELLIGENCE_TOOL_CALL_NAME_REQUIRED");
      }
      if (callId) {
        if (seenCallIds.has(callId)) {
          throw new Error(`AVANTIQO_INTELLIGENCE_TOOL_CALL_REPLAY_DETECTED:${callId}`);
        }
        seenCallIds.add(callId);
      }

      let args;
      try {
        args = parseArguments(call?.function?.arguments);
      } catch (error) {
        conversation.push(toolResultMessage(call, {
          ok: false,
          blocked: true,
          code: "AVANTIQO_INTELLIGENCE_TOOL_ARGUMENTS_INVALID_JSON",
          tool: toolName,
        }));
        totalToolCalls += 1;
        continue;
      }

      const result = await registry.execute({
        name: toolName,
        arguments: args,
        context: {
          organization_id,
          party_id,
          entity_id,
          reasoning_contract: CONTRACT,
          reasoning_turn: turn,
          tool_call_id: callId || null,
        },
        authorization: object(authorization),
      });
      totalToolCalls += 1;
      conversation.push(toolResultMessage(call, result, result.max_result_chars));
    }
  }

  throw new Error("AVANTIQO_INTELLIGENCE_REASONING_TURN_LIMIT_EXCEEDED");
}

export const AvantiqoIntelligenceReasoningRuntime = Object.freeze({
  contract: CONTRACT,
  run: runIntelligenceReasoningLoop,
  createToolRegistry: createIntelligenceToolRegistry,
});
