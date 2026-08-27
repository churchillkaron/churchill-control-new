import { spawn, spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_VOICE_STT_RUNTIME_PROBE_LIVE_LOG_DIAGNOSTIC_V1";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const LANE = "voice-stt";
const ENDPOINT_NAME = "avantiqo-voice-stt-v1";
const SAFE_LEASE_SCRIPT = resolve("scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs");
const PROBE_SCRIPT = resolve("scripts/run-avantiqo-voice-stt-runtime-probe-local.mjs");
const CONTROL_BASE = "https://api.runpod.io/v2";
const POLL_MS = Math.max(1000, Math.min(5000, Number(process.env.AVANTIQO_VOICE_STT_LIVE_LOG_POLL_MS || 1500)));
const CAPTURE_MS = Math.max(10_000, Math.min(45_000, Number(process.env.AVANTIQO_VOICE_STT_LIVE_LOG_CAPTURE_MS || 35_000)));
const LOG_TAIL = Math.max(500, Math.min(5000, Number(process.env.AVANTIQO_VOICE_STT_LIVE_LOG_TAIL || 5000)));
const MAX_CAPTURED_WORKERS = Math.max(1, Math.min(4, Number(process.env.AVANTIQO_VOICE_STT_LIVE_LOG_MAX_WORKERS || 3)));
const MAX_DIAGNOSTIC_MS = Math.max(100_000, Math.min(190_000, Number(process.env.AVANTIQO_VOICE_STT_LIVE_LOG_MAX_MS || 150_000)));
const REPORT_PATH = resolve(
  process.env.AVANTIQO_VOICE_STT_LIVE_LOG_REPORT ||
  "/tmp/avantiqo-voice-stt-runtime-probe-live-worker-diagnostic.json",
);
const CANDIDATE_STATUSES = new Set(["INITIALIZING", "READY", "IDLE", "RUNNING", "THROTTLED", "UNHEALTHY"]);

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const yes = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function redact(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi, "$1[REDACTED]");
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw).slice(0, 900)}`);
  }
  return body || {};
}

async function controlWorkers(endpointId, key) {
  const body = await readJson(await fetch(
    `${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers`,
    {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    },
  ), "AVANTIQO_VOICE_STT_LIVE_LOG_CONTROL");
  return list(body?.workers).map(safeWorker);
}

function safeWorker(worker = {}) {
  return {
    id: text(worker?.id) || null,
    status: text(worker?.status || worker?.workerStatus || worker?.runtimeStatus || worker?.desiredStatus).toUpperCase() || null,
    desired_status: text(worker?.desiredStatus || worker?.desired_status).toUpperCase() || null,
    gpu_type_id: text(worker?.gpuTypeId || worker?.gpu?.displayName || worker?.machine?.gpuDisplayName) || null,
    data_center_id: text(worker?.dataCenterId || worker?.machine?.dataCenterId) || null,
    image: text(worker?.image) || null,
    started_at: text(worker?.startedAt || worker?.createdAt) || null,
    is_stale: worker?.isStale === true,
  };
}

function parseSseFrame(frame, workerId) {
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());
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
    return {
      worker_id: workerId,
      source: "unknown",
      ts: null,
      line: redact(payload).slice(0, 5000),
    };
  }
}

async function captureWorkerLogs(endpointId, workerId, key) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CAPTURE_MS);
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
      try {
        chunk = await reader.read();
      } catch (readError) {
        if (readError?.name === "AbortError") break;
        throw readError;
      }
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
    if (captureError?.name !== "AbortError") {
      error = redact(captureError?.message || captureError).slice(0, 900);
    }
  } finally {
    clearTimeout(timeout);
  }
  if (buffer.trim()) {
    const parsed = parseSseFrame(buffer, workerId);
    if (parsed) entries.push(parsed);
  }
  return { worker_id: workerId, response_status: responseStatus, content_type: contentType, entries, error };
}

const importantPattern = /traceback|exception|error|fatal|failed|failure|runtimeerror|importerror|modulenotfound|cuda|nvidia|driver|device|fitness|unhealthy|heartbeat|torch|transformers|python|handler|runpod|worker|job|queue|poll|api|endpoint|throttl|oom|out of memory|killed|sigkill|exit code|exited|container|permission denied|no space left|unauthorized|manifest/i;
function relevant(entries) {
  const matched = entries.filter((entry) => importantPattern.test(entry.line));
  return (matched.length ? matched : entries).slice(-260);
}

function summarizeEvidence(worker, capture, after) {
  return {
    worker_id_present: Boolean(worker?.id),
    status_before: worker?.status || null,
    status_after: after?.status || null,
    desired_status_before: worker?.desired_status || null,
    gpu_type_id: worker?.gpu_type_id || after?.gpu_type_id || null,
    data_center_id: worker?.data_center_id || after?.data_center_id || null,
    image: worker?.image || after?.image || null,
    response_status: capture.response_status,
    content_type: capture.content_type,
    entry_count: capture.entries.length,
    container_output_count: capture.entries.filter((entry) => entry.source === "container").length,
    system_output_count: capture.entries.filter((entry) => entry.source === "system").length,
    relevant_log_lines: relevant(capture.entries),
    error: capture.error,
  };
}

if (!yes(process.env.AVANTIQO_VOICE_STT_RUNTIME_PROBE_LIVE_LOG_APPROVED)) {
  throw new Error("AVANTIQO_VOICE_STT_RUNTIME_PROBE_LIVE_LOG_APPROVED=YES_REQUIRED");
}

if (!yes(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE)) {
  if (!yes(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED)) {
    throw new Error("AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED=YES_REQUIRED");
  }
  required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
  const result = spawnSync(
    process.execPath,
    [SAFE_LEASE_SCRIPT, "--lane=voice-stt", "--ttl-ms=240000", "--", process.execPath, resolve(process.argv[1])],
    { cwd: process.cwd(), env: process.env, stdio: "inherit", encoding: "utf8" },
  );
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${CONTRACT}_SAFE_LEASE_SIGNAL:${result.signal}`);
  if (result.status !== 0) throw new Error(`${CONTRACT}_SAFE_LEASE_FAILED:exit=${result.status}`);
  process.exit(0);
}

if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT) {
  throw new Error("AVANTIQO_VOICE_STT_LIVE_LOG_SAFE_LEASE_V2_REQUIRED");
}
if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== LANE) {
  throw new Error("AVANTIQO_VOICE_STT_LIVE_LOG_LANE_MISMATCH");
}
if (!yes(process.env.AVANTIQO_VOICE_STT_RUNTIME_PROBE_APPROVED)) {
  throw new Error("AVANTIQO_VOICE_STT_RUNTIME_PROBE_APPROVED=YES_REQUIRED");
}

const endpointId = required("AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID");
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const started = Date.now();
const captured = new Set();
const workerEvidence = [];
let latestWorkers = [];
let childResult = null;

console.log(JSON.stringify({
  event: "AVANTIQO_VOICE_STT_RUNTIME_PROBE_LIVE_LOG_ACTIVE",
  contract: CONTRACT,
  endpoint_name: ENDPOINT_NAME,
  safe_lease_contract: SAFE_LEASE_CONTRACT,
  capture_seconds_per_worker: Math.round(CAPTURE_MS / 1000),
  max_workers_to_capture: MAX_CAPTURED_WORKERS,
  canonical_probe_runner: "scripts/run-avantiqo-voice-stt-runtime-probe-local.mjs",
  probe_runner_invocations: 1,
  additional_provider_jobs_submitted_by_diagnostic: 0,
  transcription_jobs_submitted_by_diagnostic: 0,
  tts_touched: false,
  secrets_printed: false,
}));

const child = spawn(process.execPath, [PROBE_SCRIPT], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["ignore", "inherit", "inherit"],
});

const childExit = new Promise((resolveExit, rejectExit) => {
  child.once("error", rejectExit);
  child.once("exit", (code, signal) => resolveExit({ code, signal }));
});
childExit.then((result) => { childResult = result; }).catch(() => {});

while (Date.now() - started < MAX_DIAGNOSTIC_MS) {
  latestWorkers = await controlWorkers(endpointId, managementKey).catch(() => []);
  const candidates = latestWorkers.filter((worker) =>
    worker.id && !worker.is_stale && CANDIDATE_STATUSES.has(worker.status) && !captured.has(worker.id),
  );

  console.log(JSON.stringify({
    event: "AVANTIQO_VOICE_STT_RUNTIME_PROBE_LIVE_LOG_PROGRESS",
    elapsed_seconds: Math.round((Date.now() - started) / 1000),
    child_exited: childResult !== null,
    workers: latestWorkers.map(({ id, ...worker }) => ({ ...worker, id_present: Boolean(id) })),
    workers_captured: workerEvidence.length,
    additional_provider_jobs_submitted_by_diagnostic: 0,
    secrets_printed: false,
  }));

  if (candidates.length && workerEvidence.length < MAX_CAPTURED_WORKERS) {
    const worker = candidates[0];
    captured.add(worker.id);
    console.log(JSON.stringify({
      event: "AVANTIQO_VOICE_STT_RUNTIME_PROBE_LIVE_WORKER_CAPTURE_BEGIN",
      status: worker.status,
      gpu_type_id: worker.gpu_type_id,
      data_center_id: worker.data_center_id,
      image: worker.image,
      worker_id_present: true,
      additional_provider_jobs_submitted_by_diagnostic: 0,
      secrets_printed: false,
    }));
    const capture = await captureWorkerLogs(endpointId, worker.id, managementKey);
    const afterWorkers = await controlWorkers(endpointId, managementKey).catch(() => []);
    const after = afterWorkers.find((entry) => entry.id === worker.id) || null;
    const evidence = summarizeEvidence(worker, capture, after);
    workerEvidence.push(evidence);
    console.log(JSON.stringify({
      event: "AVANTIQO_VOICE_STT_RUNTIME_PROBE_LIVE_WORKER_EVIDENCE",
      ...evidence,
      worker_id_present: true,
      secrets_printed: false,
    }, null, 2));
    if (childResult !== null && workerEvidence.length >= 1) break;
    continue;
  }

  if (childResult !== null) break;
  await sleep(POLL_MS);
}

if (childResult === null) {
  childResult = await Promise.race([
    childExit,
    sleep(15_000).then(() => null),
  ]);
}

latestWorkers = await controlWorkers(endpointId, managementKey).catch(() => latestWorkers);
if (workerEvidence.length < MAX_CAPTURED_WORKERS) {
  const remaining = latestWorkers.filter((worker) =>
    worker.id && !worker.is_stale && CANDIDATE_STATUSES.has(worker.status) && !captured.has(worker.id),
  );
  for (const worker of remaining.slice(0, MAX_CAPTURED_WORKERS - workerEvidence.length)) {
    captured.add(worker.id);
    const capture = await captureWorkerLogs(endpointId, worker.id, managementKey);
    const afterWorkers = await controlWorkers(endpointId, managementKey).catch(() => []);
    const after = afterWorkers.find((entry) => entry.id === worker.id) || null;
    const evidence = summarizeEvidence(worker, capture, after);
    workerEvidence.push(evidence);
    console.log(JSON.stringify({
      event: "AVANTIQO_VOICE_STT_RUNTIME_PROBE_LIVE_WORKER_EVIDENCE_POST_CHILD",
      ...evidence,
      worker_id_present: true,
      secrets_printed: false,
    }, null, 2));
  }
}

const result = {
  success: workerEvidence.length > 0,
  contract: CONTRACT,
  endpoint_name: ENDPOINT_NAME,
  safe_lease_contract: SAFE_LEASE_CONTRACT,
  probe_runner_invocations: 1,
  probe_exit_code: childResult?.code ?? null,
  probe_exit_signal: childResult?.signal ?? null,
  runtime_probe_passed: childResult?.code === 0,
  workers_captured: workerEvidence.length,
  workers_final_observed: latestWorkers.map(({ id, ...worker }) => ({ ...worker, id_present: Boolean(id) })),
  worker_evidence: workerEvidence,
  additional_provider_jobs_submitted_by_diagnostic: 0,
  transcription_jobs_submitted_by_diagnostic: 0,
  endpoint_mutation_performed_by_diagnostic: false,
  production_deploy_performed: false,
  tts_touched: false,
  secrets_printed: false,
};

await mkdir(dirname(REPORT_PATH), { recursive: true });
await writeFile(REPORT_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result, null, 2));
console.log(`AVANTIQO_VOICE_STT_RUNTIME_PROBE_LIVE_LOG_REPORT=${REPORT_PATH}`);

if (!result.success) {
  console.log("AVANTIQO_VOICE_STT_RUNTIME_PROBE_LIVE_LOG_DIAGNOSTIC=NO_WORKER_EVIDENCE");
  process.exitCode = 2;
} else {
  console.log("AVANTIQO_VOICE_STT_RUNTIME_PROBE_LIVE_LOG_DIAGNOSTIC=PASS");
}
