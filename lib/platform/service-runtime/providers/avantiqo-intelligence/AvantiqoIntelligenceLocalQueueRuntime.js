import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PROVIDER_ID = "avantiqo-intelligence";
const ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_INTELLIGENCE_ENGINE_V2";
const INFRASTRUCTURE_PROVIDER = "AVANTIQO_LOCAL_NODE_V1";
const JOB_PREFIX = "local-intelligence:";
const FRONT_MODEL = "Qwen/Qwen3-4B-GGUF:Q4_K_M";
const RUNTIME_MODEL = "qwen3:4b-instruct";
const LANES = new Set(["front", "fast"]);
const TRANSPORT = "supabase-pull-queue-v1";
const DEFAULT_WAIT_TIMEOUT_MS = 20_000;

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }
function enabled(value) { return ["1", "true", "yes", "on"].includes(text(value).toLowerCase()); }

const LOCAL_CONTEXT_TOKENS = 6144;
const LOCAL_CONTEXT_SAFETY_TOKENS = 384;

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

function requestedOutputTokens(input = {}, lane = "fast") {
  const requested = Number(input.max_output_tokens || input.maxOutputTokens) || 1024;
  return Math.max(1, Math.min(requested, lane === "front" ? 640 : 4096));
}

export function localIntelligenceContextFits(input = {}, lane = "fast") {
  return estimatedPromptTokens(input) + requestedOutputTokens(input, lane) + LOCAL_CONTEXT_SAFETY_TOKENS <= LOCAL_CONTEXT_TOKENS;
}

export function intelligenceLocalQueueConfigured() {
  return enabled(process.env.AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED);
}

function lane(input = {}) {
  const value = text(input.execution_lane || input.executionLane).toLowerCase() || "fast";
  if (!LANES.has(value)) throw new Error(`AVANTIQO_LOCAL_QUEUE_LANE_INVALID:${value}`);
  return value;
}

export function shouldUseLocalIntelligenceQueue(input = {}) {
  if (!intelligenceLocalQueueConfigured()) return false;
  const value = lane(input);
  const frontTaskMode = text(input.front_task_mode || input.frontTaskMode).toLowerCase();
  if (value === "front" && frontTaskMode === "conversation_light") return false;
  if (value === "front") return list(input.tools).length === 0 && localIntelligenceContextFits(input, value);
  return list(input.tools).length === 0
    && enabled(process.env.AVANTIQO_LOCAL_FAST_INTELLIGENCE_ENABLED ?? "true")
    && localIntelligenceContextFits(input, value);
}
function governedContext(input = {}) {
  const context = object(input.context);
  const organizationId = text(context.organization_id);
  const usageId = text(context.usage_id);
  if (!organizationId || !usageId) throw new Error("AVANTIQO_LOCAL_QUEUE_GOVERNED_CONTEXT_REQUIRED");
  return { organizationId, usageId };
}

function payload(input = {}, executionLane = "fast") {
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
    front_task_mode: text(input.front_task_mode || input.frontTaskMode) || null,
    temperature: Number.isFinite(Number(input.temperature)) ? Number(input.temperature) : 0.2,
    max_output_tokens: Math.max(1, Math.min(Number(input.max_output_tokens || input.maxOutputTokens) || 1024, executionLane === "front" ? 640 : 4096)),
    response_format: (input.response_format || input.responseFormat)?.type === "json_object" ? { type: "json_object" } : null,
    think: false,
  };
}

function modelForLane() { return FRONT_MODEL; }
function encodedJobId(id) { return `${JOB_PREFIX}${id}`; }
function rawJobId(value) {
  const id = text(value);
  if (!id.startsWith(JOB_PREFIX)) throw new Error("AVANTIQO_LOCAL_QUEUE_JOB_ID_REQUIRED");
  return id.slice(JOB_PREFIX.length);
}
export async function executeIntelligenceLocalQueue(input = {}) {
  if (!shouldUseLocalIntelligenceQueue(input)) throw new Error("AVANTIQO_LOCAL_QUEUE_NOT_ELIGIBLE");
  const health = await getIntelligenceLocalQueueHealth();
  if (!health.ready) throw new Error("AVANTIQO_LOCAL_QUEUE_NO_ONLINE_NODE");
  const executionLane = lane(input);
  const context = governedContext(input);
  const inserted = await supabaseAdmin
    .from("avantiqo_local_compute_jobs")
    .insert({
      organization_id: context.organizationId,
      usage_id: context.usageId,
      capability: text(input.capability) || "ai.text.generate",
      lane: executionLane,
      workload: "intelligence_text",
      model: RUNTIME_MODEL,
      payload: payload(input, executionLane),
      priority: executionLane === "front" ? 100 : 50,
      max_attempts: 2,
    })
    .select("id")
    .single();
  if (inserted.error || !inserted.data?.id) {
    throw new Error(`AVANTIQO_LOCAL_QUEUE_INSERT_FAILED:${text(inserted.error?.message || inserted.error)}`);
  }
  return {
    success: true,
    provider: PROVIDER_ID,
    model: modelForLane(executionLane),
    output: {
      provider_job_id: encodedJobId(inserted.data.id),
      status: "queued",
      engine_contract: ENGINE_CONTRACT,
      execution_lane: executionLane,
      capability: text(input.capability),
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
  const result = await supabaseAdmin
    .from("avantiqo_local_compute_jobs")
    .select("id,status,capability,lane,model,result,metrics,error_code,node_id,started_at,completed_at,updated_at")
    .eq("id", id)
    .maybeSingle();
  if (result.error) throw new Error(`AVANTIQO_LOCAL_QUEUE_STATUS_FAILED:${text(result.error.message)}`);
  const row = result.data;
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
        model: FRONT_MODEL,
        runtime_model: text(row.model) || RUNTIME_MODEL,
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

export async function getIntelligenceLocalQueueHealth() {
  if (!intelligenceLocalQueueConfigured()) {
    return { success: false, ready: false, infrastructure_provider: INFRASTRUCTURE_PROVIDER, reason: "LOCAL_QUEUE_DISABLED" };
  }
  const result = await supabaseAdmin
    .from("avantiqo_local_compute_nodes")
    .select("id,display_name,enabled,capabilities,last_seen_at,metadata")
    .eq("enabled", true)
    .contains("capabilities", ["ai.text.generate"])
    .order("last_seen_at", { ascending: false })
    .limit(8);
  if (result.error) throw new Error(`AVANTIQO_LOCAL_QUEUE_HEALTH_FAILED:${text(result.error.message)}`);
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
  const timeoutMs = Math.max(1000, Math.min(Number(options.timeout_ms || options.timeoutMs) || DEFAULT_WAIT_TIMEOUT_MS, 120000));
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
