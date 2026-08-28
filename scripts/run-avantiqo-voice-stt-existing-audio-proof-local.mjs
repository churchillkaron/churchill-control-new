import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_VOICE_STT_EXISTING_AUDIO_PROOF_V2";
const ENGINE_CONTRACT = "AVANTIQO_VOICE_ENGINE_V1";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const LEASE_SCRIPT = resolve("scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs");
const AUDIO_PATH = resolve(
  process.env.AVANTIQO_VOICE_STT_EXISTING_AUDIO ||
  "/tmp/avantiqo-voice-tts-v3-one-proof.wav",
);
const REPORT_PATH = resolve(
  process.env.AVANTIQO_VOICE_STT_EXISTING_AUDIO_REPORT ||
  "/tmp/avantiqo-voice-stt-existing-audio-proof.json",
);
const SUBMISSION_PATH = resolve(
  process.env.AVANTIQO_VOICE_STT_EXISTING_AUDIO_SUBMISSION_REPORT ||
  "/tmp/avantiqo-voice-stt-existing-audio-submission.json",
);
const LIVE_REPORT_PATH = resolve(
  process.env.AVANTIQO_VOICE_STT_EXISTING_AUDIO_LIVE_REPORT ||
  "/tmp/avantiqo-voice-stt-existing-audio-live-diagnostic.json",
);
const FOUNDATION_MODEL = "openai/whisper-large-v3-turbo";
const RUNTIME_ENTRYPOINT = "handler.py";
const RUNTIME_REVISION = "AVANTIQO_VOICE_STT_HANDLER_RUNTIME_PROBE_V1";
const API_BASE = "https://api.runpod.ai/v2";
const CONTROL_BASE = "https://api.runpod.io/v2";
const POLL_MS = 3000;
const SUBMIT_RETRY_MS = 2500;
const SUBMIT_PROPAGATION_TIMEOUT_MS = Math.max(
  30_000,
  Math.min(3 * 60_000, Number(process.env.AVANTIQO_VOICE_STT_SUBMIT_PROPAGATION_TIMEOUT_MS || 90_000)),
);
const TIMEOUT_MS = Math.max(
  60_000,
  Math.min(20 * 60_000, Number(process.env.AVANTIQO_VOICE_STT_EXISTING_AUDIO_TIMEOUT_MS || 15 * 60_000)),
);
const NO_PROGRESS_STARTUP_TIMEOUT_MS = Math.max(
  60_000,
  Math.min(8 * 60_000, Number(process.env.AVANTIQO_VOICE_STT_NO_PROGRESS_STARTUP_TIMEOUT_MS || 3 * 60_000)),
);
const LOG_CAPTURE_MS = Math.max(
  1500,
  Math.min(8000, Number(process.env.AVANTIQO_VOICE_STT_EXISTING_AUDIO_LOG_CAPTURE_MS || 3000)),
);
const LOG_CAPTURE_INTERVAL_MS = Math.max(
  8000,
  Math.min(60_000, Number(process.env.AVANTIQO_VOICE_STT_EXISTING_AUDIO_LOG_CAPTURE_INTERVAL_MS || 15_000)),
);
const LOG_TAIL = Math.max(
  500,
  Math.min(5000, Number(process.env.AVANTIQO_VOICE_STT_EXISTING_AUDIO_LOG_TAIL || 5000)),
);
const ACTIVE_WORKER_STATUSES = new Set(["IDLE", "READY", "RUNNING", "THROTTLED", "INITIALIZING", "UNHEALTHY"]);
const RELEVANT_LOG_PATTERN = /AVANTIQO|traceback|exception|runtimeerror|error|failed|failure|cuda|nvidia|driver|torch|transformers|whisper|huggingface|safetensor|download|snapshot|tokenizer|prompt|audio|ffmpeg|librosa|soundfile|handler|runpod|worker|job|queue|progress|poll|endpoint|fitness|unhealthy|throttl|oom|out of memory|killed|sigkill|exit code|exited|container|permission denied|no space left|unauthorized|manifest/i;

function text(value) { return String(value ?? "").trim(); }
function yes(value) { return ["YES", "TRUE", "1", "APPROVED"].includes(text(value).toUpperCase()); }
function required(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function sleep(ms) { return new Promise((resolveSleep) => setTimeout(resolveSleep, ms)); }
function list(value) { return Array.isArray(value) ? value : []; }
function safeDetail(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi, "$1[REDACTED]")
    .slice(0, 5000);
}
function errorCode(body) {
  return text(body?.code || body?.errorCode || body?.error_code || body?.statusCode || body?.status_code).toUpperCase();
}
function errorMessage(body, raw) {
  const candidate =
    (typeof body?.error === "string" ? body.error : null) ||
    body?.message ||
    body?.detail ||
    body?.error?.message ||
    raw;
  return safeDetail(candidate);
}
function healthJobs(body = {}) {
  const jobs = body?.jobs && typeof body.jobs === "object" ? body.jobs : {};
  return {
    in_queue: Number(jobs.inQueue ?? jobs.in_queue ?? 0) || 0,
    in_progress: Number(jobs.inProgress ?? jobs.in_progress ?? 0) || 0,
    completed: Number(jobs.completed ?? 0) || 0,
    failed: Number(jobs.failed ?? 0) || 0,
    retried: Number(jobs.retried ?? 0) || 0,
  };
}
function workerSummary(worker = {}) {
  return {
    id: text(worker?.id) || null,
    status: text(worker?.status || worker?.desiredStatus).toUpperCase() || null,
    gpu_type_id: text(worker?.gpuTypeId || worker?.gpu?.displayName || worker?.machine?.gpuDisplayName) || null,
    data_center_id: text(worker?.dataCenterId || worker?.machine?.dataCenterId) || null,
    image: text(worker?.image) || null,
    started_at: text(worker?.startedAt || worker?.createdAt) || null,
    stale: worker?.isStale === true,
  };
}

async function request(endpointId, path, apiKey, options = {}) {
  const response = await fetch(`${API_BASE}/${encodeURIComponent(endpointId)}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const code = errorCode(body);
    const detail = errorMessage(body, raw);
    const error = new Error(`RUNPOD_HTTP_${response.status}${code ? `:${code}` : ""}${detail ? `:${detail}` : ""}`);
    error.status = response.status;
    error.runpodCode = code;
    error.runpodDetail = detail;
    throw error;
  }
  return body || {};
}

async function controlWorkers(endpointId, managementKey) {
  const response = await fetch(`${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers`, {
    headers: { Authorization: `Bearer ${managementKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`RUNPOD_CONTROL_HTTP_${response.status}:${safeDetail(body?.message || body?.error || raw)}`);
  return list(body?.workers);
}

function activeWorkerCount(workers) {
  return workers.filter((worker) => {
    const status = text(worker?.status || worker?.desiredStatus).toUpperCase();
    return ACTIVE_WORKER_STATUSES.has(status) && worker?.isStale !== true;
  }).length;
}

function isEndpointPausedConflict(error) {
  if (Number(error?.status) !== 409) return false;
  const code = text(error?.runpodCode).toUpperCase();
  const detail = text(error?.runpodDetail).toUpperCase();
  return code === "ENDPOINT_PAUSED" || detail.includes("ENDPOINT_PAUSED") || detail.includes("ENDPOINT PAUSED") || detail.includes("PAUSED");
}

async function submitAfterGatewayPropagation(endpointId, apiKey, body) {
  const startedAt = Date.now();
  const deadline = startedAt + SUBMIT_PROPAGATION_TIMEOUT_MS;
  let attempts = 0;
  let lastPausedDetail = null;

  while (Date.now() < deadline) {
    attempts += 1;
    try {
      const submission = await request(endpointId, "/run", apiKey, {
        method: "POST",
        body,
        timeoutMs: 15_000,
      });
      console.log(JSON.stringify({
        event: "AVANTIQO_VOICE_STT_SUBMIT_ACCEPTED",
        attempts,
        propagation_wait_ms: Date.now() - startedAt,
        generation_submitted: false,
        stt_jobs_submitted: 1,
        secrets_printed: false,
      }));
      return { submission, attempts, propagationWaitMs: Date.now() - startedAt };
    } catch (error) {
      if (!isEndpointPausedConflict(error)) throw error;
      lastPausedDetail = safeDetail(error?.runpodDetail || error?.message);
      console.log(JSON.stringify({
        event: "AVANTIQO_VOICE_STT_GATEWAY_PROPAGATION_WAIT",
        attempts,
        elapsed_ms: Date.now() - startedAt,
        runpod_status: 409,
        runpod_code: text(error?.runpodCode) || "ENDPOINT_PAUSED",
        generation_submitted: false,
        stt_jobs_submitted: 0,
        secrets_printed: false,
      }));
      await sleep(SUBMIT_RETRY_MS);
    }
  }

  throw new Error(
    `AVANTIQO_VOICE_STT_EXISTING_AUDIO_GATEWAY_PROPAGATION_TIMEOUT${lastPausedDetail ? `:${lastPausedDetail}` : ""}`,
  );
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
      line: safeDetail(parsed?.line ?? parsed?.raw ?? payload),
    };
  } catch {
    return {
      worker_id: workerId,
      source: "unknown",
      ts: null,
      line: safeDetail(payload),
    };
  }
}

async function captureWorkerLogs(endpointId, workerId, managementKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOG_CAPTURE_MS);
  const entries = [];
  let buffer = "";
  let responseStatus = null;
  let error = null;
  try {
    const response = await fetch(
      `${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers/${encodeURIComponent(workerId)}/logs?tail=${LOG_TAIL}`,
      {
        headers: { Authorization: `Bearer ${managementKey}`, Accept: "text/event-stream" },
        signal: controller.signal,
      },
    );
    responseStatus = response.status;
    if (!response.ok) {
      error = `RUNPOD_LOG_HTTP_${response.status}:${safeDetail(await response.text())}`;
      return { worker_id: workerId, response_status: responseStatus, entries, error };
    }
    if (!response.body) {
      return { worker_id: workerId, response_status: responseStatus, entries, error: "RUNPOD_LOG_STREAM_BODY_REQUIRED" };
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      let chunk;
      try {
        chunk = await reader.read();
      } catch (caught) {
        if (caught?.name === "AbortError") break;
        throw caught;
      }
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || "";
      for (const frame of frames) {
        const entry = parseSseFrame(frame, workerId);
        if (entry) entries.push(entry);
      }
    }
  } catch (caught) {
    if (caught?.name !== "AbortError") error = safeDetail(caught?.message || caught);
  } finally {
    clearTimeout(timer);
  }
  if (buffer.trim()) {
    const entry = parseSseFrame(buffer, workerId);
    if (entry) entries.push(entry);
  }
  return { worker_id: workerId, response_status: responseStatus, entries, error };
}

function dedupeLogs(entries) {
  const seen = new Set();
  const result = [];
  for (const entry of entries) {
    const key = `${entry.worker_id || ""}|${entry.source || ""}|${entry.ts || ""}|${entry.line || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
  }
  return result.slice(-1200);
}

async function runProofInsideLease() {
  const endpointId = required("AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID");
  const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID);
  if (configuredEndpointId && configuredEndpointId !== endpointId) {
    throw new Error(`AVANTIQO_VOICE_STT_EXISTING_AUDIO_CONFIGURED_ENDPOINT_MISMATCH:${configuredEndpointId}:${endpointId}`);
  }
  const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
  const apiKey = text(process.env.RUNPOD_API_KEY) || managementKey;
  if (!yes(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE)) throw new Error("AVANTIQO_VOICE_STT_EXISTING_AUDIO_SAFE_LEASE_REQUIRED");
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT) throw new Error("AVANTIQO_VOICE_STT_EXISTING_AUDIO_SAFE_LEASE_V2_REQUIRED");
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== "voice-stt") throw new Error("AVANTIQO_VOICE_STT_EXISTING_AUDIO_SAFE_LEASE_LANE_MISMATCH");
  if (!existsSync(AUDIO_PATH)) throw new Error(`AVANTIQO_VOICE_STT_EXISTING_AUDIO_REQUIRED:${AUDIO_PATH}`);

  const audio = await readFile(AUDIO_PATH);
  if (audio.length <= 1000) throw new Error(`AVANTIQO_VOICE_STT_EXISTING_AUDIO_TOO_SMALL:${audio.length}`);

  const initialJobs = healthJobs(await request(endpointId, "/health", apiKey));
  if (initialJobs.in_queue || initialJobs.in_progress) {
    throw new Error(`AVANTIQO_VOICE_STT_EXISTING_AUDIO_JOB_BLOCKED:${initialJobs.in_queue}:${initialJobs.in_progress}`);
  }

  const usageId = `voice-stt-existing-audio-${Date.now()}`;
  const submissionBody = {
    input: {
      contract: ENGINE_CONTRACT,
      capability: "ai.speech.to.text",
      foundation_model: FOUNDATION_MODEL,
      organization_id: "benchmark-only",
      usage_id: usageId,
      workload: {
        audio_base64: audio.toString("base64"),
        file_name: basename(AUDIO_PATH),
        mime_type: "audio/wav",
        language: "en",
        vocabulary_context: "Avantiqo voice generator is working and ready",
      },
    },
  };
  const { submission, attempts, propagationWaitMs } = await submitAfterGatewayPropagation(endpointId, apiKey, submissionBody);

  const jobId = text(submission.id);
  if (!jobId) throw new Error("AVANTIQO_VOICE_STT_EXISTING_AUDIO_JOB_ID_REQUIRED");

  const submittedAt = new Date().toISOString();
  const submissionReceipt = {
    success: true,
    contract: "AVANTIQO_VOICE_STT_EXISTING_AUDIO_SUBMISSION_V1",
    proof_contract: CONTRACT,
    safe_lease_contract: SAFE_LEASE_CONTRACT,
    lane: "voice-stt",
    endpoint_id_present: true,
    job_id: jobId,
    usage_id: usageId,
    submitted_at: submittedAt,
    submit_attempts: attempts,
    propagation_wait_ms: propagationWaitMs,
    stt_jobs_submitted: 1,
    transcription_requested: true,
    tts_generation_submitted: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  };
  await writeFile(SUBMISSION_PATH, `${JSON.stringify(submissionReceipt, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    event: "AVANTIQO_VOICE_STT_JOB_ID_PERSISTED",
    job_id_present: true,
    submission_report: SUBMISSION_PATH,
    stt_jobs_submitted: 1,
    secrets_printed: false,
  }));

  const startedAt = Date.now();
  const deadline = startedAt + TIMEOUT_MS;
  let completed = null;
  let workerEverObserved = false;
  let inProgressEverObserved = false;
  let lastState = "UNKNOWN";
  let lastJobs = { in_queue: 0, in_progress: 0, completed: 0, failed: 0, retried: 0 };
  let latestWorkers = [];
  let logEntries = [];
  const lastLogCaptureAt = new Map();
  const statusHistory = [];

  const persistLive = async (extra = {}) => {
    const relevant = logEntries.filter((entry) => RELEVANT_LOG_PATTERN.test(entry.line)).slice(-320);
    const live = {
      success: false,
      contract: "AVANTIQO_VOICE_STT_EXISTING_AUDIO_LIVE_DIAGNOSTIC_V1",
      proof_contract: CONTRACT,
      safe_lease_contract: SAFE_LEASE_CONTRACT,
      lane: "voice-stt",
      endpoint_id_present: true,
      job_id: jobId,
      usage_id: usageId,
      submitted_at: submittedAt,
      elapsed_seconds: Math.floor((Date.now() - startedAt) / 1000),
      last_job_state: lastState,
      worker_ever_observed: workerEverObserved,
      in_progress_ever_observed: inProgressEverObserved,
      health_jobs: lastJobs,
      workers: latestWorkers.map(workerSummary),
      status_history: statusHistory.slice(-120),
      captured_log_entry_count: logEntries.length,
      relevant_log_lines: relevant,
      stt_jobs_submitted: 1,
      tts_generation_submitted: false,
      production_deploy_performed: false,
      pricing_activation_performed: false,
      secrets_printed: false,
      ...extra,
    };
    await writeFile(LIVE_REPORT_PATH, `${JSON.stringify(live, null, 2)}\n`, "utf8");
  };

  const captureEligibleWorkerLogs = async (force = false) => {
    for (const worker of latestWorkers) {
      const summary = workerSummary(worker);
      if (!summary.id || summary.stale || !ACTIVE_WORKER_STATUSES.has(summary.status)) continue;
      const previous = Number(lastLogCaptureAt.get(summary.id) || 0);
      if (!force && Date.now() - previous < LOG_CAPTURE_INTERVAL_MS) continue;
      lastLogCaptureAt.set(summary.id, Date.now());
      const capture = await captureWorkerLogs(endpointId, summary.id, managementKey);
      logEntries = dedupeLogs([...logEntries, ...capture.entries]);
      console.log(JSON.stringify({
        event: "AVANTIQO_VOICE_STT_EXISTING_AUDIO_WORKER_LOG_CAPTURE",
        worker_status: summary.status,
        gpu_type_id: summary.gpu_type_id,
        data_center_id: summary.data_center_id,
        response_status: capture.response_status,
        captured_entries: capture.entries.length,
        capture_error: capture.error,
        secrets_printed: false,
      }));
    }
  };

  while (Date.now() < deadline) {
    const status = await request(endpointId, `/status/${encodeURIComponent(jobId)}`, apiKey);
    const state = text(status.status).toUpperCase();
    lastState = state || "UNKNOWN";
    statusHistory.push({ at: new Date().toISOString(), state: lastState });

    if (state === "COMPLETED") {
      completed = status;
      await persistLive({ terminal_state: "COMPLETED" });
      break;
    }

    const [workers, health] = await Promise.all([
      controlWorkers(endpointId, managementKey),
      request(endpointId, "/health", apiKey),
    ]);
    latestWorkers = workers;
    const activeWorkers = activeWorkerCount(workers);
    if (activeWorkers > 0) workerEverObserved = true;
    lastJobs = healthJobs(health);
    if (
      ["IN_PROGRESS", "RUNNING", "PROCESSING"].includes(state) ||
      lastJobs.in_progress > 0
    ) {
      inProgressEverObserved = true;
    }

    await captureEligibleWorkerLogs(false);
    await persistLive();

    console.log(JSON.stringify({
      event: "AVANTIQO_VOICE_STT_EXISTING_AUDIO_PROGRESS",
      elapsed_seconds: Math.floor((Date.now() - startedAt) / 1000),
      job_state: lastState,
      health: lastJobs,
      worker_ever_observed: workerEverObserved,
      in_progress_ever_observed: inProgressEverObserved,
      active_workers: activeWorkers,
      captured_log_entry_count: logEntries.length,
      stt_jobs_submitted: 1,
      secrets_printed: false,
    }));

    if (["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(state)) {
      await captureEligibleWorkerLogs(true).catch(() => null);
      const detail = safeDetail(status?.error || status?.message || status?.output?.error || "");
      await persistLive({ terminal_state: state, terminal_detail: detail || null });
      throw new Error(`AVANTIQO_VOICE_STT_EXISTING_AUDIO_JOB_${state}${detail ? `:${detail}` : ""}`);
    }

    if (!inProgressEverObserved && Date.now() - startedAt >= NO_PROGRESS_STARTUP_TIMEOUT_MS) {
      await captureEligibleWorkerLogs(true).catch(() => null);
      await request(endpointId, `/cancel/${encodeURIComponent(jobId)}`, apiKey, { method: "POST" }).catch(() => null);
      await persistLive({
        terminal_state: "CANCEL_REQUESTED_NOT_CLAIMED",
        terminal_detail: `state=${lastState}:queue=${lastJobs.in_queue}:progress=${lastJobs.in_progress}:worker_seen=${workerEverObserved}`,
      });
      throw new Error(
        `AVANTIQO_VOICE_STT_EXISTING_AUDIO_JOB_NOT_CLAIMED:state=${lastState}:queue=${lastJobs.in_queue}:progress=${lastJobs.in_progress}:worker_seen=${workerEverObserved}`,
      );
    }
    await sleep(POLL_MS);
  }

  if (!completed) {
    await captureEligibleWorkerLogs(true).catch(() => null);
    await request(endpointId, `/cancel/${encodeURIComponent(jobId)}`, apiKey, { method: "POST" }).catch(() => null);
    await persistLive({ terminal_state: "CANCEL_REQUESTED_TIMEOUT" });
    throw new Error("AVANTIQO_VOICE_STT_EXISTING_AUDIO_TIMEOUT");
  }

  const output = completed.output || {};
  const transcript = text(output.transcript || output.text);
  const normalized = transcript.toLowerCase();
  const keywordMatched = normalized.includes("avantiqo") && normalized.includes("voice") && normalized.includes("ready");
  const vocabularyContextReceived = output.vocabulary_context_received === true;
  const vocabularyContextApplied = output.vocabulary_context_applied === true;
  const vocabularyContextTokenCount = Number(output.vocabulary_context_token_count) || 0;
  const entrypointMatched = text(output.entrypoint) === RUNTIME_ENTRYPOINT;
  const runtimeRevisionMatched = text(output.runtime_revision) === RUNTIME_REVISION;
  const passed =
    transcript.length > 0 &&
    keywordMatched &&
    text(output.capability) === "ai.speech.to.text" &&
    text(output.foundation_model) === FOUNDATION_MODEL &&
    entrypointMatched &&
    runtimeRevisionMatched &&
    vocabularyContextReceived &&
    vocabularyContextApplied &&
    vocabularyContextTokenCount > 0 &&
    output.raw_audio_persisted === false &&
    output.raw_reasoning_persisted === false;

  const report = {
    success: passed,
    contract: CONTRACT,
    safe_lease_contract: SAFE_LEASE_CONTRACT,
    lane: "voice-stt",
    input_audio_path: AUDIO_PATH,
    input_audio_bytes: audio.length,
    tts_generation_submitted: false,
    stt_jobs_submitted: 1,
    job_id: jobId,
    usage_id: usageId,
    transcript,
    language: text(output.language) || null,
    detected_language: text(output.detected_language) || null,
    keyword_matched: keywordMatched,
    model: text(output.model) || null,
    foundation_model: text(output.foundation_model) || null,
    entrypoint: text(output.entrypoint) || null,
    entrypoint_matched: entrypointMatched,
    runtime_revision: text(output.runtime_revision) || null,
    runtime_revision_matched: runtimeRevisionMatched,
    vocabulary_context_received: vocabularyContextReceived,
    vocabulary_context_applied: vocabularyContextApplied,
    vocabulary_context_token_count: vocabularyContextTokenCount,
    worker_ever_observed: workerEverObserved,
    in_progress_ever_observed: inProgressEverObserved,
    captured_log_entry_count: logEntries.length,
    relevant_log_lines: logEntries.filter((entry) => RELEVANT_LOG_PATTERN.test(entry.line)).slice(-200),
    raw_audio_persisted: output.raw_audio_persisted === true,
    raw_reasoning_persisted: output.raw_reasoning_persisted === true,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  };
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await persistLive({ terminal_state: "COMPLETED", proof_success: passed, transcript_present: Boolean(transcript) });
  console.log(JSON.stringify(report, null, 2));
  if (!passed) throw new Error("AVANTIQO_VOICE_STT_EXISTING_AUDIO_PROOF_REJECTED");
}

if (!yes(process.env.AVANTIQO_VOICE_STT_EXISTING_AUDIO_APPROVED)) {
  throw new Error("AVANTIQO_VOICE_STT_EXISTING_AUDIO_APPROVED=YES_REQUIRED");
}

if (yes(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE)) {
  await runProofInsideLease();
} else {
  if (!existsSync(LEASE_SCRIPT)) throw new Error("AVANTIQO_VOICE_STT_EXISTING_AUDIO_LEASE_SCRIPT_REQUIRED");
  const result = spawnSync(process.execPath, [LEASE_SCRIPT, "--lane=voice-stt", "--ttl-ms=1200000", "--", process.execPath, resolve(process.argv[1])], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${CONTRACT}_FAILED:exit=${result.status}`);
}
