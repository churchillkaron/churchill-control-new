import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_VOICE_STT_ZERO_JOB_STARTUP_CAPTURE_V1";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const LEASE_SCRIPT = resolve("scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs");
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTROL_BASE = "https://api.runpod.io/v2";
const WAIT_MS = Math.max(30_000, Math.min(120_000, Number(process.env.AVANTIQO_VOICE_STT_ZERO_JOB_WAIT_MS || 90_000)));
const POLL_MS = Math.max(1000, Math.min(5000, Number(process.env.AVANTIQO_VOICE_STT_ZERO_JOB_POLL_MS || 1500)));
const LOG_CAPTURE_MS = Math.max(5000, Math.min(45_000, Number(process.env.AVANTIQO_VOICE_STT_ZERO_JOB_LOG_CAPTURE_MS || 20_000)));
const LOG_TAIL = Math.max(200, Math.min(5000, Number(process.env.AVANTIQO_VOICE_STT_ZERO_JOB_LOG_TAIL || 2000)));
const REPORT_PATH = resolve(
  process.env.AVANTIQO_VOICE_STT_ZERO_JOB_REPORT ||
  "/tmp/avantiqo-voice-stt-zero-job-startup-capture.json",
);
const CANDIDATE_STATUSES = new Set(["INITIALIZING", "UNHEALTHY", "READY", "RUNNING", "IDLE", "THROTTLED"]);

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function yes(value) { return ["YES", "TRUE", "1", "APPROVED"].includes(text(value).toUpperCase()); }
function required(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function sleep(ms) { return new Promise((resolveSleep) => setTimeout(resolveSleep, ms)); }
function redact(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi, "$1[REDACTED]");
}
function healthJobs(body = {}) {
  const jobs = body?.jobs && typeof body.jobs === "object" ? body.jobs : {};
  return {
    in_queue: Number(jobs.inQueue ?? jobs.in_queue ?? 0) || 0,
    in_progress: Number(jobs.inProgress ?? jobs.in_progress ?? 0) || 0,
  };
}
function safeWorker(worker = {}) {
  return {
    id: text(worker?.id) || null,
    status: text(worker?.status || worker?.desiredStatus).toUpperCase() || null,
    gpu_type_id: text(worker?.gpuTypeId || worker?.gpu?.displayName || worker?.machine?.gpuDisplayName) || null,
    data_center_id: text(worker?.dataCenterId || worker?.machine?.dataCenterId) || null,
    image: text(worker?.image) || null,
    started_at: text(worker?.startedAt || worker?.createdAt) || null,
    is_stale: worker?.isStale === true,
  };
}
async function parseJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = redact(text(body?.message || body?.error || body?.detail || raw)).slice(0, 900);
    throw new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}
async function queueHealth(endpointId, key) {
  return parseJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_STT_ZERO_JOB_QUEUE");
}
async function controlWorkers(endpointId, key) {
  const body = await parseJson(await fetch(`${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_STT_ZERO_JOB_CONTROL");
  return list(body?.workers).map(safeWorker);
}
function parseSseFrame(frame, workerId) {
  const data = frame.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart());
  if (!data.length) return null;
  const payload = data.join("\n");
  try {
    const parsed = JSON.parse(payload);
    return {
      worker_id: workerId,
      source: text(parsed?.source) || "unknown",
      ts: text(parsed?.ts) || null,
      line: redact(parsed?.line ?? parsed?.raw ?? payload).slice(0, 5000),
    };
  } catch {
    return { worker_id: workerId, source: "unknown", ts: null, line: redact(payload).slice(0, 5000) };
  }
}
async function captureWorkerLogs(endpointId, workerId, key) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOG_CAPTURE_MS);
  const entries = [];
  let responseStatus = null;
  let contentType = null;
  let buffer = "";
  let error = null;
  try {
    const response = await fetch(
      `${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers/${encodeURIComponent(workerId)}/logs?tail=${LOG_TAIL}`,
      {
        headers: { Authorization: `Bearer ${key}`, Accept: "text/event-stream" },
        signal: controller.signal,
      },
    );
    responseStatus = response.status;
    contentType = text(response.headers.get("content-type")) || null;
    if (!response.ok) {
      const raw = await response.text();
      error = `RUNPOD_LOG_HTTP_${response.status}:${redact(raw).slice(0, 900)}`;
      return { worker_id: workerId, response_status: responseStatus, content_type: contentType, entries, error };
    }
    if (!response.body) {
      error = "RUNPOD_LOG_STREAM_BODY_REQUIRED";
      return { worker_id: workerId, response_status: responseStatus, content_type: contentType, entries, error };
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      let chunk;
      try { chunk = await reader.read(); }
      catch (readError) { if (readError?.name === "AbortError") break; throw readError; }
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || "";
      for (const frame of frames) {
        const parsed = parseSseFrame(frame, workerId);
        if (parsed) entries.push(parsed);
      }
    }
  } catch (captureError) {
    if (captureError?.name !== "AbortError") error = redact(captureError?.message || captureError).slice(0, 900);
  } finally {
    clearTimeout(timeout);
  }
  if (buffer.trim()) {
    const parsed = parseSseFrame(buffer, workerId);
    if (parsed) entries.push(parsed);
  }
  return { worker_id: workerId, response_status: responseStatus, content_type: contentType, entries, error };
}

const importantPattern = /traceback|exception|error|fatal|failed|failure|runtimeerror|importerror|modulenotfound|cuda|nvidia|driver|device|fitness|unhealthy|heartbeat|torch|transformers|python|handler|runpod|oom|out of memory|killed|sigkill|exit code|exited|container|permission denied|no space left|unauthorized|pull access denied/i;
function relevant(entries) {
  const matched = entries.filter((entry) => importantPattern.test(entry.line));
  return (matched.length ? matched : entries).slice(-220);
}
function classify(entries, worker) {
  const joined = entries.map((entry) => entry.line).join("\n");
  const causes = [];
  if (/cuda.*driver|driver.*cuda|cuda driver version is insufficient|failed call to cuinit|libcuda/i.test(joined)) causes.push("CUDA_DRIVER_RUNTIME_FAILURE");
  if (/torch\.cuda\.is_available|cuda required|no cuda|cuda unavailable|no nvidia gpu/i.test(joined)) causes.push("CUDA_FITNESS_FAILURE");
  if (/fitness.*fail|worker is unhealthy|health check.*fail/i.test(joined)) causes.push("WORKER_FITNESS_FAILURE");
  if (/traceback|runtimeerror|exception:|importerror|modulenotfounderror/i.test(joined)) causes.push("PYTHON_STARTUP_FAILURE");
  if (/out of memory|\boom\b|exit code 137|sigkill|killed process/i.test(joined)) causes.push("MEMORY_OR_OOM_FAILURE");
  if (/no space left on device|disk quota exceeded|insufficient disk/i.test(joined)) causes.push("CONTAINER_DISK_FAILURE");
  if (/failed to start container|oci runtime|runc.*error|exec format error|permission denied|executable file not found/i.test(joined)) causes.push("CONTAINER_RUNTIME_START_FAILURE");
  if (/401|unauthorized|authentication required|pull access denied|manifest unknown/i.test(joined)) causes.push("IMAGE_PULL_OR_REGISTRY_FAILURE");
  if (!causes.length && worker?.status === "UNHEALTHY") causes.push("UNHEALTHY_CAUSE_REQUIRES_LOG_REVIEW");
  if (!causes.length && entries.length === 0) causes.push("NO_LOG_LINES_RETURNED");
  return [...new Set(causes)];
}

if (!yes(process.env.AVANTIQO_VOICE_STT_ZERO_JOB_STARTUP_APPROVED)) {
  throw new Error("AVANTIQO_VOICE_STT_ZERO_JOB_STARTUP_APPROVED=YES_REQUIRED");
}

if (!yes(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE)) {
  if (!yes(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED)) {
    throw new Error("AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED=YES_REQUIRED");
  }
  required("RUNPOD_MANAGEMENT_API_KEY");
  const result = spawnSync(
    process.execPath,
    [LEASE_SCRIPT, "--lane=voice-stt", "--ttl-ms=180000", "--", process.execPath, resolve(process.argv[1])],
    { cwd: process.cwd(), env: process.env, stdio: "inherit", encoding: "utf8" },
  );
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${CONTRACT}_SAFE_LEASE_SIGNAL:${result.signal}`);
  if (result.status !== 0) throw new Error(`${CONTRACT}_SAFE_LEASE_FAILED:exit=${result.status}`);
  process.exit(0);
}

if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT) {
  throw new Error("AVANTIQO_VOICE_STT_ZERO_JOB_SAFE_LEASE_V2_REQUIRED");
}
if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== "voice-stt") {
  throw new Error("AVANTIQO_VOICE_STT_ZERO_JOB_LANE_MISMATCH");
}

const endpointId = required("AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID");
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const queueKey = text(process.env.RUNPOD_API_KEY) || managementKey;
const initialJobs = healthJobs(await queueHealth(endpointId, queueKey));
if (initialJobs.in_queue !== 0 || initialJobs.in_progress !== 0) {
  throw new Error(`AVANTIQO_VOICE_STT_ZERO_JOB_INITIAL_QUEUE_NOT_CLEAN:${initialJobs.in_queue}:${initialJobs.in_progress}`);
}

console.log(JSON.stringify({
  event: "AVANTIQO_VOICE_STT_ZERO_JOB_STARTUP_CAPTURE_ACTIVE",
  contract: CONTRACT,
  wait_seconds: Math.round(WAIT_MS / 1000),
  log_capture_seconds: Math.round(LOG_CAPTURE_MS / 1000),
  stt_jobs_submitted: 0,
  run_endpoint_called: false,
  queue_initial: initialJobs,
  tts_touched: false,
  secrets_printed: false,
}));

const deadline = Date.now() + WAIT_MS;
const seen = new Set();
const evidence = [];
let polls = 0;
let workerEverObserved = false;

while (Date.now() < deadline) {
  polls += 1;
  const [health, workers] = await Promise.all([
    queueHealth(endpointId, queueKey),
    controlWorkers(endpointId, managementKey),
  ]);
  const jobs = healthJobs(health);
  if (jobs.in_queue !== 0 || jobs.in_progress !== 0) {
    throw new Error(`AVANTIQO_VOICE_STT_ZERO_JOB_UNEXPECTED_JOB_APPEARED:${jobs.in_queue}:${jobs.in_progress}`);
  }

  const candidates = workers.filter((worker) =>
    worker.id && !worker.is_stale && CANDIDATE_STATUSES.has(worker.status),
  );
  if (candidates.length) workerEverObserved = true;

  if (polls === 1 || polls % 5 === 0 || candidates.length) {
    console.log(JSON.stringify({
      event: "AVANTIQO_VOICE_STT_ZERO_JOB_STARTUP_PROGRESS",
      elapsed_seconds: Math.round((WAIT_MS - Math.max(0, deadline - Date.now())) / 1000),
      queue: jobs,
      workers: workers.map(({ id, ...worker }) => ({ ...worker, id_present: Boolean(id) })),
      stt_jobs_submitted: 0,
      run_endpoint_called: false,
      secrets_printed: false,
    }));
  }

  for (const worker of candidates) {
    if (seen.has(worker.id)) continue;
    seen.add(worker.id);
    console.log(JSON.stringify({
      event: "AVANTIQO_VOICE_STT_ZERO_JOB_WORKER_LOG_CAPTURE_BEGIN",
      status: worker.status,
      gpu_type_id: worker.gpu_type_id,
      data_center_id: worker.data_center_id,
      worker_id_present: true,
      stt_jobs_submitted: 0,
      secrets_printed: false,
    }));
    const capture = await captureWorkerLogs(endpointId, worker.id, managementKey);
    const afterWorkers = await controlWorkers(endpointId, managementKey).catch(() => []);
    const after = afterWorkers.find((item) => item.id === worker.id) || null;
    const row = {
      worker_id_present: true,
      status_before: worker.status,
      status_after: after?.status || "NO_LONGER_LISTED",
      gpu_type_id: worker.gpu_type_id,
      data_center_id: worker.data_center_id,
      response_status: capture.response_status,
      content_type: capture.content_type,
      entry_count: capture.entries.length,
      container_output_count: capture.entries.filter((entry) => entry.source === "container").length,
      likely_causes: classify(capture.entries, after || worker),
      relevant_log_lines: relevant(capture.entries),
      error: capture.error,
    };
    evidence.push(row);
    console.log(JSON.stringify({ event: "AVANTIQO_VOICE_STT_ZERO_JOB_WORKER_EVIDENCE", ...row }, null, 2));
    if (capture.entries.length > 0 || row.status_after === "UNHEALTHY") break;
  }

  if (evidence.some((row) => row.entry_count > 0 || row.status_after === "UNHEALTHY")) break;
  await sleep(POLL_MS);
}

const finalJobs = healthJobs(await queueHealth(endpointId, queueKey));
if (finalJobs.in_queue !== 0 || finalJobs.in_progress !== 0) {
  throw new Error(`AVANTIQO_VOICE_STT_ZERO_JOB_FINAL_QUEUE_NOT_CLEAN:${finalJobs.in_queue}:${finalJobs.in_progress}`);
}

const result = {
  success: true,
  contract: CONTRACT,
  safe_lease_contract: SAFE_LEASE_CONTRACT,
  lane: "voice-stt",
  zero_job_capture: true,
  stt_jobs_submitted: 0,
  run_endpoint_called: false,
  generation_submitted: false,
  queue_mutation_performed: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  tts_touched: false,
  wait_seconds: Math.round(WAIT_MS / 1000),
  polls,
  worker_ever_observed: workerEverObserved,
  workers_captured: evidence.length,
  queue_initial: initialJobs,
  queue_final: finalJobs,
  worker_evidence: evidence,
  capture_outcome: evidence.length ? "WORKER_EVIDENCE_CAPTURED" : "NO_WORKER_APPEARED_WITHOUT_JOB",
  secrets_printed: false,
};
await mkdir(dirname(REPORT_PATH), { recursive: true });
await writeFile(REPORT_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result, null, 2));
console.log(`AVANTIQO_VOICE_STT_ZERO_JOB_STARTUP_REPORT=${REPORT_PATH}`);
console.log("AVANTIQO_VOICE_STT_ZERO_JOB_STARTUP_CAPTURE=PASS");
