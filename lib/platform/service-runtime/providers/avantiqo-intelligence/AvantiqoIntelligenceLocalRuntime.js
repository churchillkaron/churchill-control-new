import {
  AVANTIQO_INTELLIGENCE_LOCAL_CONTEXT_SAFETY_TOKENS,
  AVANTIQO_INTELLIGENCE_LOCAL_CONTEXT_TOKENS,
  AVANTIQO_INTELLIGENCE_LOCAL_FAST_OUTPUT_CAP,
  AVANTIQO_INTELLIGENCE_LOCAL_FRONT_OUTPUT_CAP,
  AVANTIQO_INTELLIGENCE_LOCAL_MODEL,
} from "./AvantiqoIntelligenceLocalPolicy.js";
import { randomUUID } from "node:crypto";

const PROVIDER_ID = "avantiqo-intelligence";
const ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_INTELLIGENCE_ENGINE_V2";
const INFRASTRUCTURE_PROVIDER = "AVANTIQO_LOCAL_NODE_V1";
const TRANSPORT = "ollama-http-lan-v1";
const FRONT_FOUNDATION_MODEL = AVANTIQO_INTELLIGENCE_LOCAL_MODEL;
const DEFAULT_RUNTIME_MODEL = "qwen3:4b-instruct";
const FRONT_RUNTIME_CONTRACT = "AVANTIQO_INTELLIGENCE_FRONT_CPU_WARM_V2";
const REQUEST_TIMEOUT_MS = 30_000;
const LANES = new Set(["front", "fast"]);

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }
function bool(value, fallback = false) {
  const normalized = text(value).toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}
function localUrl() { return text(process.env.AVANTIQO_LOCAL_COMPUTE_URL).replace(/\/+$/, ""); }
function runtimeModel() { return text(process.env.AVANTIQO_LOCAL_INTELLIGENCE_MODEL) || DEFAULT_RUNTIME_MODEL; }
function fastEnabled() { return bool(process.env.AVANTIQO_LOCAL_FAST_INTELLIGENCE_ENABLED, true); }
function toolCallsEnabled() { return bool(process.env.AVANTIQO_LOCAL_FAST_TOOL_CALLS_ENABLED, false); }

const LOCAL_CONTEXT_TOKENS = AVANTIQO_INTELLIGENCE_LOCAL_CONTEXT_TOKENS;
const LOCAL_CONTEXT_SAFETY_TOKENS = AVANTIQO_INTELLIGENCE_LOCAL_CONTEXT_SAFETY_TOKENS;

function estimatedPromptTokens(input = {}) {
  const messages = list(input.messages);
  const parts = messages.length
    ? messages.map((entry) => `${text(entry?.role)}:${String(entry?.content ?? "")}`)
    : [
        text(input.system_prompt || input.systemPrompt || input.instructions_text),
        text(input.prompt || input.input || input.text),
      ];
  const chars = parts.filter(Boolean).join("\n").length;
  return Math.max(1, Math.ceil(chars / 3.2));
}

function localOutputTokenCap(lane = "fast") {
  return lane === "front" ? AVANTIQO_INTELLIGENCE_LOCAL_FRONT_OUTPUT_CAP : AVANTIQO_INTELLIGENCE_LOCAL_FAST_OUTPUT_CAP;
}

function requestedOutputTokens(input = {}) {
  const requested = Number(input.max_output_tokens || input.maxOutputTokens) || 1024;
  return Math.max(1, requested);
}

export function localIntelligenceContextFits(input = {}, lane = "fast") {
  const requested = requestedOutputTokens(input);
  if (requested > localOutputTokenCap(lane)) return false;
  return estimatedPromptTokens(input) + requested + LOCAL_CONTEXT_SAFETY_TOKENS <= LOCAL_CONTEXT_TOKENS;
}

function assertSafeLocalUrl(value) {
  const parsed = new URL(value);
  const host = parsed.hostname.toLowerCase();
  const privateIpv4 = /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  const loopback = host === "127.0.0.1" || host === "localhost" || host === "::1";
  if (parsed.protocol === "https:") return parsed.toString().replace(/\/$/, "");
  if (parsed.protocol === "http:" && (privateIpv4 || loopback)) return parsed.toString().replace(/\/$/, "");
  throw new Error("AVANTIQO_LOCAL_COMPUTE_URL_PRIVATE_OR_HTTPS_REQUIRED");
}

export function intelligenceLocalConfigured() {
  const value = localUrl();
  if (!value) return false;
  assertSafeLocalUrl(value);
  return true;
}

function executionLane(input = {}) {
  const lane = text(input.execution_lane || input.executionLane).toLowerCase() || "fast";
  if (!LANES.has(lane)) throw new Error(`AVANTIQO_LOCAL_INTELLIGENCE_LANE_INVALID:${lane}`);
  return lane;
}

export function shouldUseLocalIntelligence(input = {}) {
  if (!intelligenceLocalConfigured()) return false;
  const lane = executionLane(input);
  const frontTaskMode = text(input.front_task_mode || input.frontTaskMode).toLowerCase();
  if (lane === "front" && frontTaskMode === "conversation_light") return false;
  if (lane === "front") return localIntelligenceContextFits(input, lane);
  if (!fastEnabled()) return false;
  const tools = list(input.tools);
  return (tools.length === 0 || toolCallsEnabled()) && localIntelligenceContextFits(input, lane);
}

function sanitizedMessages(input = {}, lane = "fast") {
  const messages = list(input.messages)
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => ({
      role: text(entry.role) || "user",
      ...(entry.content === null ? { content: "" } : { content: String(entry.content ?? "") }),
      ...(entry.tool_call_id ? { tool_call_id: text(entry.tool_call_id) } : {}),
      ...(entry.tool_calls ? { tool_calls: entry.tool_calls } : {}),
    }));
  if (!messages.length && text(input.prompt || input.input || input.text)) {
    messages.push({ role: "user", content: text(input.prompt || input.input || input.text) });
  }
  const system = text(input.system_prompt || input.systemPrompt || input.instructions_text);
  if (system && !messages.some((entry) => entry.role === "system")) {
    messages.unshift({ role: "system", content: system });
  }
  if (lane === "front") {
    const index = messages.findIndex((entry) => entry.role === "system");
    const directive = " /no_think\nDo not reveal chain-of-thought. Return only the requested answer.";
    if (index >= 0) messages[index] = { ...messages[index], content: `${messages[index].content}${directive}` };
    else messages.unshift({ role: "system", content: directive.trim() });
  }
  return messages;
}

function cleanReasoningLeak(value) {
  let source = String(value ?? "");
  const closing = source.lastIndexOf("</think>");
  if (closing >= 0) source = source.slice(closing + 8);
  source = source.replace(/<think>[\s\S]*?<\/think>/gi, "");
  return source.trim();
}

function normalizeToolCalls(value) {
  return list(value).map((call) => {
    const fn = object(call?.function);
    const args = fn.arguments && typeof fn.arguments === "object"
      ? JSON.stringify(fn.arguments)
      : text(fn.arguments) || "{}";
    return {
      id: text(call?.id) || `local_${randomUUID()}`,
      type: "function",
      function: { name: text(fn.name), arguments: args },
    };
  }).filter((call) => call.function.name);
}

async function request(path, body = null, timeoutMs = REQUEST_TIMEOUT_MS) {
  const base = assertSafeLocalUrl(localUrl());
  const response = await fetch(`${base}${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`AVANTIQO_LOCAL_COMPUTE_HTTP_${response.status}:${text(await response.text()).slice(0, 500)}`);
  }
  return response.json();
}

export async function getIntelligenceLocalHealth() {
  const started = Date.now();
  const version = await request("/api/version", null, 5_000);
  return {
    success: true,
    infrastructure_provider: INFRASTRUCTURE_PROVIDER,
    transport: TRANSPORT,
    node_url_host: new URL(assertSafeLocalUrl(localUrl())).hostname,
    runtime_version: text(version?.version) || null,
    runtime_model: runtimeModel(),
    latency_ms: Date.now() - started,
  };
}

export async function executeIntelligenceLocal(input = {}) {
  const lane = executionLane(input);
  if (!shouldUseLocalIntelligence(input)) throw new Error("AVANTIQO_LOCAL_INTELLIGENCE_NOT_ELIGIBLE");
  const started = Date.now();
  const tools = list(input.tools);
  const payload = {
    model: runtimeModel(),
    messages: sanitizedMessages(input, lane),
    stream: false,
    think: false,
    keep_alive: text(process.env.AVANTIQO_LOCAL_MODEL_KEEP_ALIVE) || "30m",
    options: {
      temperature: Number.isFinite(Number(input.temperature)) ? Number(input.temperature) : 0.2,
      num_ctx: LOCAL_CONTEXT_TOKENS,
      num_predict: Math.max(1, Math.min(Number(input.max_output_tokens || input.maxOutputTokens) || 1024, lane === "front" ? 640 : 4096)),
    },
    ...(tools.length ? { tools } : {}),
    ...((input.response_format || input.responseFormat)?.type === "json_object" ? { format: "json" } : {}),
  };
  const raw = await request("/api/chat", payload);
  const message = object(raw?.message);
  const toolCalls = normalizeToolCalls(message.tool_calls);
  const answer = cleanReasoningLeak(message.content);
  const durationNs = Number(raw?.total_duration || 0);
  const generationSeconds = durationNs > 0 ? durationNs / 1_000_000_000 : (Date.now() - started) / 1000;
  const model = lane === "front" ? FRONT_FOUNDATION_MODEL : FRONT_FOUNDATION_MODEL;
  return {
    success: true,
    provider: PROVIDER_ID,
    model,
    output: {
      status: "completed",
      provider: PROVIDER_ID,
      engine_contract: ENGINE_CONTRACT,
      execution_lane: lane,
      capability: text(input.capability),
      model,
      runtime_model: runtimeModel(),
      infrastructure_provider: INFRASTRUCTURE_PROVIDER,
      local_node: true,
      transport: TRANSPORT,
      text: answer,
      tool_calls: toolCalls,
      finish_reason: text(raw?.done_reason) || (toolCalls.length ? "tool_calls" : "stop"),
      mutation_authority: false,
      tools_allowed: lane === "front" ? false : tools.length > 0,
      raw_reasoning_persisted: false,
      ...(lane === "front" ? { front_runtime_contract: FRONT_RUNTIME_CONTRACT } : {}),
      generation_seconds: generationSeconds,
      startup_ready_seconds: Number(raw?.load_duration || 0) / 1_000_000_000 || 0,
      prompt_tokens: Number(raw?.prompt_eval_count || 0),
      completion_tokens: Number(raw?.eval_count || 0),
      usage: {
        input_tokens: Number(raw?.prompt_eval_count || 0),
        output_tokens: Number(raw?.eval_count || 0),
        compute_ms: Math.max(0, Math.round(generationSeconds * 1000)),
      },
    },
  };
}

export const AVANTIQO_INTELLIGENCE_LOCAL_INFRASTRUCTURE = INFRASTRUCTURE_PROVIDER;
export const AVANTIQO_INTELLIGENCE_LOCAL_TRANSPORT = TRANSPORT;
export const AVANTIQO_INTELLIGENCE_LOCAL_FOUNDATION_MODEL = FRONT_FOUNDATION_MODEL;
