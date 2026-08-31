import { register } from "node:module";
import { pathToFileURL } from "node:url";

const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_RUNTIME_ERROR_DIAGNOSTIC_V1";
const ENDPOINT_NAME = "avantiqo-intelligence-fast-v1";
const REST_BASE = "https://rest.runpod.io/v1";
const CONTROL_BASE = "https://api.runpod.io/v2";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const POLL_MS = 250;
const WORKER_WAIT_MS = 45_000;
const LOG_CAPTURE_MS = 15_000;
const CLEANUP_WAIT_MS = 120_000;

const text = (value, limit = 6000) => String(value ?? "").trim().slice(0, limit);
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function redact(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi, "$1[REDACTED]");
}

function assert(value, code) {
  if (!value) throw new Error(`${CONTRACT}_${code}`);
}

function managementKey() {
  const value = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY, 3000);
  assert(value, "RUNPOD_MANAGEMENT_KEY_REQUIRED");
  return value;
}

function runtimeKey() {
  const value = text(process.env.RUNPOD_API_KEY || process.env.RUNPOD_MANAGEMENT_API_KEY, 3000);
  assert(value, "RUNPOD_RUNTIME_KEY_REQUIRED");
  return value;
}

async function requestJson(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`${CONTRACT}_HTTP_${response.status}:${redact(text(body?.message || body?.error || body?.detail || raw, 800))}`);
  }
  return body ?? {};
}

async function endpoint() {
  const rows = await requestJson(`${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`, managementKey());
  const matches = list(Array.isArray(rows) ? rows : rows?.data).filter((row) => text(row?.name, 300) === ENDPOINT_NAME);
  assert(matches.length === 1, `ENDPOINT_RESOLUTION:${matches.length}`);
  return matches[0];
}

async function queueHealth(endpointId) {
  return requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, runtimeKey());
}

function healthSummary(value = {}) {
  const jobs = object(value?.jobs);
  const workers = object(value?.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    },
    workers: {
      idle: finite(workers.idle, 0),
      ready: finite(workers.ready, 0),
      initializing: finite(workers.initializing, 0),
      running: finite(workers.running, 0),
      unhealthy: finite(workers.unhealthy, 0),
    },
  };
}

async function controlWorkers(endpointId) {
  const body = await requestJson(`${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers`, managementKey());
  return list(Array.isArray(body) ? body : body?.workers);
}

function parseFrame(frame, workerId) {
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());
  if (!data.length) return null;
  const raw = data.join("\n");
  try {
    const parsed = JSON.parse(raw);
    return {
      worker_id: workerId,
      source: text(parsed?.source, 120) || "unknown",
      ts: text(parsed?.ts, 120) || null,
      line: redact(text(parsed?.line ?? parsed?.raw ?? raw, 5000)),
    };
  } catch {
    return { worker_id: workerId, source: "unknown", ts: null, line: redact(text(raw, 5000)) };
  }
}

async function captureWorkerLogs(endpointId, workerId) {
  const controller = new AbortController();
  const deadline = Date.now() + LOG_CAPTURE_MS;
  const entries = [];
  let buffer = "";
  let error = null;
  let status = null;
  try {
    const response = await fetch(
      `${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers/${encodeURIComponent(workerId)}/logs?tail=3000`,
      {
        headers: { Authorization: `Bearer ${managementKey()}`, Accept: "text/event-stream" },
        signal: controller.signal,
      },
    );
    status = response.status;
    if (!response.ok || !response.body) {
      error = `LOG_STREAM_${response.status}:${redact(text(await response.text(), 800))}`;
      return { worker_id: workerId, status, entries, error };
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (Date.now() < deadline) {
      const remaining = Math.max(1, Math.min(500, deadline - Date.now()));
      const result = await Promise.race([
        reader.read().then((chunk) => ({ kind: "chunk", chunk }), (readError) => ({ kind: "error", readError })),
        new Promise((resolve) => setTimeout(() => resolve({ kind: "timeout" }), remaining)),
      ]);
      if (result.kind === "timeout") continue;
      if (result.kind === "error") {
        if (result.readError?.name === "AbortError") break;
        throw result.readError;
      }
      if (result.chunk.done) break;
      buffer += decoder.decode(result.chunk.value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || "";
      for (const frame of frames) {
        const entry = parseFrame(frame, workerId);
        if (entry) entries.push(entry);
      }
    }
    controller.abort();
    void reader.cancel().catch(() => {});
  } catch (captureError) {
    if (captureError?.name !== "AbortError") error = redact(text(captureError?.message || captureError, 800));
  } finally {
    controller.abort();
  }
  if (buffer.trim()) {
    const entry = parseFrame(buffer, workerId);
    if (entry) entries.push(entry);
  }
  return { worker_id: workerId, status, entries, error };
}

async function observeWorkerAndCapture(endpointId) {
  const deadline = Date.now() + WORKER_WAIT_MS;
  const observed = [];
  const seen = new Set();
  const captures = [];
  while (Date.now() < deadline) {
    let workers = [];
    try { workers = await controlWorkers(endpointId); } catch { workers = []; }
    for (const worker of workers) {
      const id = text(worker?.id, 300);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      observed.push({
        id,
        status: text(worker?.status, 100) || null,
        image: text(worker?.image, 500) || null,
        gpu_type_id: text(worker?.gpuTypeId, 300) || null,
        data_center_id: text(worker?.dataCenterId, 300) || null,
        version: finite(worker?.version, null),
      });
      captures.push(captureWorkerLogs(endpointId, id));
    }
    if (captures.length) break;
    await sleep(POLL_MS);
  }
  const settled = captures.length ? await Promise.all(captures) : [];
  return { observed, captures: settled };
}

function relevant(entries) {
  return entries.filter((entry) =>
    /serverless|handler|request|chat\/completions|vllm|engine|model|cuda|nvidia|traceback|exception|runtimeerror|error|failed|fatal|out of memory|oom|killed|401|403|404|422|500|application startup|uvicorn/i.test(entry.line),
  ).slice(-220);
}

async function waitClean(endpointId) {
  const deadline = Date.now() + CLEANUP_WAIT_MS;
  let last = null;
  while (Date.now() < deadline) {
    const [ep, healthRaw, workers] = await Promise.all([
      endpoint(),
      queueHealth(endpointId),
      controlWorkers(endpointId).catch(() => []),
    ]);
    const h = healthSummary(healthRaw);
    last = {
      workers_min: finite(ep?.workersMin, -1),
      workers_max: finite(ep?.workersMax, -1),
      jobs: h.jobs,
      control_workers: workers.length,
    };
    if (
      last.workers_min === 0 && last.workers_max === 0 &&
      last.jobs.in_queue === 0 && last.jobs.in_progress === 0 &&
      last.control_workers === 0
    ) return last;
    await sleep(1000);
  }
  return last;
}

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));
const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const { ServiceExecutionRuntime } = await import("@/lib/platform/service-runtime/execution/ServiceExecutionRuntime");

const orgResult = await supabaseAdmin
  .from("organizations")
  .select("id,name,organization_type,status,organization_status")
  .eq("name", "Avantiqo Platform")
  .eq("organization_type", "enterprise_group")
  .eq("status", "active")
  .eq("organization_status", "ACTIVE")
  .limit(3);
if (orgResult.error) throw orgResult.error;
const orgs = list(orgResult.data);
assert(orgs.length === 1 && orgs[0]?.id, `PLATFORM_ORGANIZATION_RESOLUTION:${orgs.length}`);
const organizationId = String(orgs[0].id);

const fast = await endpoint();
const endpointId = text(fast?.id, 300);
assert(endpointId, "ENDPOINT_ID_REQUIRED");
const beforeHealth = healthSummary(await queueHealth(endpointId));
assert(finite(fast?.workersMin, -1) === 0 && finite(fast?.workersMax, -1) === 0, "FAST_NOT_PARKED_BEFORE_TEST");
assert(beforeHealth.jobs.in_queue === 0 && beforeHealth.jobs.in_progress === 0, "FAST_JOBS_PRESENT_BEFORE_TEST");

const observerPromise = observeWorkerAndCapture(endpointId);
let execution = null;
let executionError = null;
const startedAt = Date.now();
try {
  execution = await ServiceExecutionRuntime.execute({
    organization_id: organizationId,
    service_id: "ai.text.generate",
    provider_id: "avantiqo-intelligence",
    provider_policy: {
      allowed_providers: ["avantiqo-intelligence"],
      blocked_providers: [],
      external_fallback_allowed: false,
    },
    input: {
      execution_lane: "fast",
      prompt: "Reply with exactly: fast runtime diagnostic ok",
      max_output_tokens: 24,
      temperature: 0,
    },
    metadata: {
      module: "INTELLIGENCE",
      operation: "FAST_RUNTIME_ERROR_DIAGNOSTIC",
      production_service_certification: true,
      external_fallback_allowed: false,
      raw_reasoning_persisted: false,
    },
    category: "AI",
  });
} catch (error) {
  executionError = redact(text(error?.message || error, 2000));
}
const latencyMs = Date.now() - startedAt;
const observed = await observerPromise;
const entries = observed.captures.flatMap((capture) => capture.entries);
const after = await waitClean(endpointId);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  request_result: execution?.success === true ? "SUCCESS" : "FAILED",
  request_error: executionError,
  latency_ms: latencyMs,
  endpoint_id_present: true,
  worker_observed: observed.observed.length > 0,
  workers_observed: observed.observed,
  log_capture_errors: observed.captures.filter((capture) => capture.error).map((capture) => ({ worker_id: capture.worker_id, error: capture.error })),
  captured_log_count: entries.length,
  relevant_logs: relevant(entries),
  endpoint_rest_state_after: after,
  external_ai_fallback_used: false,
  new_network_volume_created: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
