import {
  AVANTIQO_INTELLIGENCE_LOCAL_CONTEXT_SAFETY_TOKENS,
  AVANTIQO_INTELLIGENCE_LOCAL_CONTEXT_TOKENS,
  AVANTIQO_INTELLIGENCE_LOCAL_FAST_OUTPUT_CAP,
  AVANTIQO_INTELLIGENCE_LOCAL_DEEP_OUTPUT_CAP,
  AVANTIQO_INTELLIGENCE_LOCAL_FRONT_OUTPUT_CAP,
  AVANTIQO_INTELLIGENCE_LOCAL_MODEL,
} from "./AvantiqoIntelligenceLocalPolicy.js";
import { supabaseAdmin } from "../../../../shared/supabase/admin.js";
import { enqueueLocalComputeJob } from "../AvantiqoLocalComputeEnqueueRuntime.js";
import resolveIntelligenceProductPolicy from "./IntelligenceProductPolicyRuntime.js";
import {
  DEFAULT_INTELLIGENCE_RUNTIME_MODEL,
  displayIntelligenceRuntimeModel,
} from "./IntelligenceModelRegistry.js";

const PROVIDER_ID = "avantiqo-intelligence";
const ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_INTELLIGENCE_ENGINE_V2";
const INFRASTRUCTURE_PROVIDER = "AVANTIQO_LOCAL_NODE_V1";
const JOB_PREFIX = "local-intelligence:";
const FRONT_MODEL = AVANTIQO_INTELLIGENCE_LOCAL_MODEL;
const LANES = new Set(["front", "fast", "deep"]);
const TRANSPORT = "supabase-pull-queue-v1";
const DEFAULT_WAIT_TIMEOUT_MS = 20_000;

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }
function enabled(value) { return ["1", "true", "yes", "on"].includes(text(value).toLowerCase()); }
function transientQueueReadError(value) {
  const message = text(value).toLowerCase();
  return /\b(408|425|429|500|502|503|504|520|521|522|523|524|525)\b/.test(message)
    || /pgrst002|schema cache|statement timeout|connection timeout|connection timed out|connection terminated|ssl handshake|web server is down|temporarily unavailable|fetch failed|network/.test(message);
}
async function retryQueueRead(read, label, attempts = 5) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let result = null;
    try {
      result = await read(controller.signal);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
    if (result && !result.error) return result;
    if (result?.error) lastError = result.error;
    const message = text(lastError?.message || lastError);
    const transient = transientQueueReadError(message) || /abort|aborted|timeout/.test(message.toLowerCase());
    if (!transient || attempt === attempts) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(8000, 750 * (2 ** (attempt - 1)))));
  }
  throw new Error(label + ":" + text(lastError?.message || lastError));
}

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
  if (lane === "front") return AVANTIQO_INTELLIGENCE_LOCAL_FRONT_OUTPUT_CAP;
  if (lane === "deep") return AVANTIQO_INTELLIGENCE_LOCAL_DEEP_OUTPUT_CAP;
  return AVANTIQO_INTELLIGENCE_LOCAL_FAST_OUTPUT_CAP;
}

function requestedOutputTokens(input = {}) {
  const requested = Number(input.max_output_tokens || input.maxOutputTokens) || 1024;
  return Math.max(1, requested);
}

export function assessLocalIntelligenceCapacity(input = {}, lane = "fast") {
  const requested_output_tokens = requestedOutputTokens(input);
  const output_cap_tokens = localOutputTokenCap(lane);
  const estimated_prompt_tokens = estimatedPromptTokens(input);
  const estimated_total_tokens = estimated_prompt_tokens + requested_output_tokens + LOCAL_CONTEXT_SAFETY_TOKENS;
  if (requested_output_tokens > output_cap_tokens) {
    return {
      fits: false,
      reason_code: "LOCAL_OUTPUT_CAPACITY_EXCEEDED",
      lane,
      requested_output_tokens,
      output_cap_tokens,
      estimated_prompt_tokens,
      context_safety_tokens: LOCAL_CONTEXT_SAFETY_TOKENS,
      estimated_total_tokens,
      context_cap_tokens: LOCAL_CONTEXT_TOKENS,
    };
  }
  if (estimated_total_tokens > LOCAL_CONTEXT_TOKENS) {
    return {
      fits: false,
      reason_code: "LOCAL_CONTEXT_CAPACITY_EXCEEDED",
      lane,
      requested_output_tokens,
      output_cap_tokens,
      estimated_prompt_tokens,
      context_safety_tokens: LOCAL_CONTEXT_SAFETY_TOKENS,
      estimated_total_tokens,
      context_cap_tokens: LOCAL_CONTEXT_TOKENS,
    };
  }
  return {
    fits: true,
    reason_code: null,
    lane,
    requested_output_tokens,
    output_cap_tokens,
    estimated_prompt_tokens,
    context_safety_tokens: LOCAL_CONTEXT_SAFETY_TOKENS,
    estimated_total_tokens,
    context_cap_tokens: LOCAL_CONTEXT_TOKENS,
  };
}

export function localIntelligenceContextFits(input = {}, lane = "fast") {
  return assessLocalIntelligenceCapacity(input, lane).fits;
}

export function intelligenceLocalQueueConfigured(input = {}) {
  const policy = text(
    input.infrastructure_policy ||
    input.infrastructurePolicy ||
    input.compute_policy ||
    input.computePolicy
  ).toLowerCase();
  const requestRequiresLocal =
    policy === "local_only" ||
    enabled(input.local_compute_required ?? input.localComputeRequired);
  return requestRequiresLocal ||
    enabled(process.env.AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED ?? "true");
}

function lane(input = {}) {
  const value = text(input.execution_lane || input.executionLane).toLowerCase() || "fast";
  if (!LANES.has(value)) throw new Error(`AVANTIQO_LOCAL_QUEUE_LANE_INVALID:${value}`);
  return value;
}

export function shouldUseLocalIntelligenceQueue(input = {}) {
  if (!intelligenceLocalQueueConfigured(input)) return false;
  const value = lane(input);
  const policy = text(
    input.infrastructure_policy ||
    input.infrastructurePolicy ||
    input.compute_policy ||
    input.computePolicy
  ).toLowerCase();
  const localRequired = policy === "local_only" || enabled(input.local_compute_required ?? input.localComputeRequired);
  const frontTaskMode = text(input.front_task_mode || input.frontTaskMode).toLowerCase();
  if (value === "front") {
    return list(input.tools).length === 0 &&
      localIntelligenceContextFits(input, value) &&
      !["external_research","provider_tool_required"].includes(frontTaskMode);
  }
  return list(input.tools).length === 0
    && (localRequired || enabled(process.env.AVANTIQO_LOCAL_FAST_INTELLIGENCE_ENABLED ?? "true"))
    && localIntelligenceContextFits(input, value);
}
function governedContext(input = {}) {
  const context = object(input.context);
  const organizationId = text(context.organization_id);
  const usageId = text(context.usage_id);
  if (!organizationId || !usageId) throw new Error("AVANTIQO_LOCAL_QUEUE_GOVERNED_CONTEXT_REQUIRED");
  return { organizationId, usageId };
}

function payload(input = {}, executionLane = "fast", productPolicy = null) {
  const messages = list(input.messages).map((entry) => ({
    role: text(entry?.role) || "user",
    content: entry?.content === null ? "" : String(entry?.content ?? ""),
  }));
  if (!messages.length && text(input.prompt || input.input || input.text)) {
    messages.push({ role: "user", content: text(input.prompt || input.input || input.text) });
  }
  if (executionLane === "front") {
    const index = messages.findIndex((entry) => entry.role === "system");
    const directive = " /no_think\nDo not reveal chain-of-thought. Return only the requested answer.";
    if (index >= 0) messages[index] = { ...messages[index], content: `${messages[index].content}${directive}` };
    else messages.unshift({ role: "system", content: directive.trim() });
  }
  return {
    messages,
    service_capability: text(input.capability) || null,
    front_task_mode: text(input.front_task_mode || input.frontTaskMode) || null,
    metadata: {
      module: text(input.metadata?.module) || null,
      operation: text(input.metadata?.operation) || null,
      intelligence_product: productPolicy?.product || "shared",
      intelligence_contract: productPolicy?.contract || "shared.text.generate",
      interactive_code: productPolicy?.interactive_code === true,
    },
    temperature: Number.isFinite(Number(input.temperature)) ? Number(input.temperature) : 0.2,
    max_output_tokens: Math.max(1, Math.min(Number(input.max_output_tokens || input.maxOutputTokens) || 1024, localOutputTokenCap(executionLane))),
    response_format: (input.response_format || input.responseFormat)?.type === "json_object" ? { type: "json_object" } : null,
    think: executionLane === "deep",
  };
}

function intelligenceProductPolicy(input = {}, executionLane = "fast") {
  return resolveIntelligenceProductPolicy(input, executionLane);
}
function runtimeModelForInput(input = {}, executionLane = "fast") {
  return intelligenceProductPolicy(input, executionLane).runtime_model;
}
function modelForLane(input = {}, executionLane = "fast") {
  return intelligenceProductPolicy(input, executionLane).display_model || FRONT_MODEL;
}
function encodedJobId(id) { return `${JOB_PREFIX}${id}`; }
function rawJobId(value) {
  const id = text(value);
  if (!id.startsWith(JOB_PREFIX)) throw new Error("AVANTIQO_LOCAL_QUEUE_JOB_ID_REQUIRED");
  return id.slice(JOB_PREFIX.length);
}
export async function executeIntelligenceLocalQueue(input = {}) {
  if (!shouldUseLocalIntelligenceQueue(input)) throw new Error("AVANTIQO_LOCAL_QUEUE_NOT_ELIGIBLE");
  const health = await getIntelligenceLocalQueueHealth(input);
  if (!health.ready) throw new Error("AVANTIQO_LOCAL_QUEUE_NO_ONLINE_NODE");
  const executionLane = lane(input);
  const context = governedContext(input);
  const productPolicy = intelligenceProductPolicy(input, executionLane);
  const inserted = await enqueueLocalComputeJob({
    organization_id: context.organizationId,
    usage_id: context.usageId,
    capability: "ai.text.generate",
    lane: executionLane,
    workload: "intelligence_text",
    model: productPolicy.runtime_model,
    payload: {
      ...payload(input, executionLane, productPolicy),
      intelligence_product: productPolicy.product,
      intelligence_contract: productPolicy.contract,
    },
    priority: text(context.usageId).startsWith("creative-temporal:")
        ? 110
        : executionLane === "front"
          ? 100
          : (executionLane === "deep" && text(input.capability) === "ai.reasoning.execute" ? 95 : 50),
    max_attempts: 2,
    input,
  });
  return {
    success: true,
    provider: PROVIDER_ID,
    model: modelForLane(input, executionLane),
    output: {
      provider_job_id: encodedJobId(inserted.id),
      status: "queued",
      engine_contract: ENGINE_CONTRACT,
      execution_lane: executionLane,
      capability: text(input.capability),
      intelligence_product: productPolicy.product,
      intelligence_contract: productPolicy.contract,
      infrastructure_provider: INFRASTRUCTURE_PROVIDER,
      local_node: true,
      transport: TRANSPORT,
      raw_reasoning_persisted: false,
    },
  };
}

export function isIntelligenceLocalQueueJob(value) {
  return text(value).startsWith(JOB_PREFIX);
}

export async function getIntelligenceLocalQueueStatus(input = {}) {
  const jobId = text(input.job_id || input.jobId || input.provider_job_id);
  const id = rawJobId(jobId);
  const result = await retryQueueRead(
    (signal) => supabaseAdmin
      .from("avantiqo_local_compute_jobs")
      .select("id,status,capability,lane,model,result,metrics,error_code,node_id,started_at,completed_at,updated_at")
      .eq("id", id)
      .maybeSingle()
      .abortSignal(signal),
    "AVANTIQO_LOCAL_QUEUE_STATUS_FAILED",
  );
  const row = result?.data;
  if (!row) return { status: "failed", provider_job_id: jobId, error: "AVANTIQO_LOCAL_QUEUE_JOB_NOT_FOUND" };
  const status = text(row.status).toUpperCase();
  if (status === "COMPLETED") {
    const output = object(row.result);
    return {
      status: "completed",
      provider_job_id: jobId,
      output: {
        ...output,
        status: "completed",
        provider: PROVIDER_ID,
        engine_contract: ENGINE_CONTRACT,
        infrastructure_provider: INFRASTRUCTURE_PROVIDER,
        execution_lane: text(row.lane),
        capability: text(row.capability),
        model: displayIntelligenceRuntimeModel(row.model),
        runtime_model: text(row.model) || DEFAULT_INTELLIGENCE_RUNTIME_MODEL,
        local_node: true,
        node_id: row.node_id || null,
        metrics: object(row.metrics),
        raw_reasoning_persisted: false,
        mutation_authority: false,
        tools_allowed: false,
        generation_seconds: Number(object(row.metrics).elapsed_ms || 0) / 1000,
        prompt_tokens: Number(object(output.usage).input_tokens || 0),
        completion_tokens: Number(object(output.usage).output_tokens || 0),
      },
      usage: object(output.usage),
      infrastructure_provider: INFRASTRUCTURE_PROVIDER,
    };
  }
  if (["FAILED", "CANCELLED"].includes(status)) {
    return { status: "failed", provider_job_id: jobId, error: text(row.error_code) || `AVANTIQO_LOCAL_QUEUE_${status}` };
  }
  return {
    status: status === "RUNNING" ? "processing" : "queued",
    provider_job_id: jobId,
    infrastructure_provider: INFRASTRUCTURE_PROVIDER,
    local_node: true,
  };
}

export async function cancelIntelligenceLocalQueue(input = {}) {
  const jobId = text(input.job_id || input.jobId || input.provider_job_id);
  const id = rawJobId(jobId);
  const result = await supabaseAdmin
    .from("avantiqo_local_compute_jobs")
    .update({ status: "CANCELLED", payload: {}, leased_until: null, completed_at: new Date().toISOString(), updated_at: new Date().toISOString(), error_code: "CANCELLED_BY_CALLER" })
    .eq("id", id)
    .in("status", ["QUEUED", "RUNNING"])
    .select("id,status")
    .maybeSingle();
  if (result.error) throw new Error(`AVANTIQO_LOCAL_QUEUE_CANCEL_FAILED:${text(result.error.message)}`);
  return { success: true, cancelled: Boolean(result.data), provider_job_id: jobId, exact_job_only: true };
}

export const AVANTIQO_INTELLIGENCE_LOCAL_QUEUE_JOB_PREFIX = JOB_PREFIX;

export async function getIntelligenceLocalQueueHealth(input = {}) {
  if (!intelligenceLocalQueueConfigured(input)) {
    return { success: false, ready: false, infrastructure_provider: INFRASTRUCTURE_PROVIDER, reason: "LOCAL_QUEUE_DISABLED" };
  }
  const result = await retryQueueRead(
    (signal) => supabaseAdmin
      .from("avantiqo_local_compute_nodes")
      .select("id,display_name,enabled,capabilities,last_seen_at,metadata")
      .eq("enabled", true)
      .contains("capabilities", ["ai.text.generate"])
      .order("last_seen_at", { ascending: false })
      .limit(8)
      .abortSignal(signal),
    "AVANTIQO_LOCAL_QUEUE_HEALTH_FAILED",
  );
  const now = Date.now();
  const nodes = (result.data || []).map((node) => {
    const seen = new Date(node.last_seen_at || 0).getTime();
    const heartbeatAgeSeconds = Number.isFinite(seen) ? Math.max(0, Math.round((now - seen) / 1000)) : null;
    return { ...node, heartbeat_age_seconds: heartbeatAgeSeconds, online: heartbeatAgeSeconds !== null && heartbeatAgeSeconds <= 90 };
  });
  return {
    success: true,
    ready: nodes.some((node) => node.online),
    infrastructure_provider: INFRASTRUCTURE_PROVIDER,
    transport: TRANSPORT,
    nodes,
    online_nodes: nodes.filter((node) => node.online).length,
  };
}

export async function executeIntelligenceLocalQueueAndWait(input = {}, options = {}) {
  const submitted = await executeIntelligenceLocalQueue(input);
  const jobId = text(submitted?.output?.provider_job_id);
  const timeoutMs = Math.max(1000, Math.min(Number(options.timeout_ms || options.timeoutMs) || DEFAULT_WAIT_TIMEOUT_MS, 600000));
  const pollMs = Math.max(100, Math.min(Number(options.poll_ms || options.pollMs) || 250, 2000));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await getIntelligenceLocalQueueStatus({ provider_job_id: jobId });
    if (status?.status === "completed") {
      return { success: true, provider: PROVIDER_ID, model: FRONT_MODEL, output: status.output };
    }
    if (status?.status === "failed") throw new Error(text(status.error) || "AVANTIQO_LOCAL_QUEUE_FAILED");
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  await cancelIntelligenceLocalQueue({ provider_job_id: jobId }).catch(() => null);
  throw new Error(`AVANTIQO_LOCAL_QUEUE_TIMEOUT:${timeoutMs}`);
}

export const AVANTIQO_INTELLIGENCE_LOCAL_QUEUE_INFRASTRUCTURE = INFRASTRUCTURE_PROVIDER;
export const AVANTIQO_INTELLIGENCE_LOCAL_QUEUE_TRANSPORT = TRANSPORT;
