import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_VOICE_STT_EXISTING_AUDIO_PROOF_V1";
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
const FOUNDATION_MODEL = "openai/whisper-large-v3-turbo";
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
const ACTIVE_WORKER_STATUSES = new Set(["IDLE", "READY", "RUNNING", "THROTTLED", "INITIALIZING", "UNHEALTHY"]);

function text(value) { return String(value ?? "").trim(); }
function yes(value) { return ["YES", "TRUE", "1", "APPROVED"].includes(text(value).toUpperCase()); }
function required(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function sleep(ms) { return new Promise((resolveSleep) => setTimeout(resolveSleep, ms)); }
function safeDetail(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .slice(0, 400);
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
  return Array.isArray(body?.workers) ? body.workers : [];
}

function activeWorkerCount(workers) {
  return workers.filter((worker) => {
    const status = text(worker?.status).toUpperCase();
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
      return submission;
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

  const submissionBody = {
    input: {
      contract: ENGINE_CONTRACT,
      capability: "ai.speech.to.text",
      foundation_model: FOUNDATION_MODEL,
      organization_id: "benchmark-only",
      usage_id: `voice-stt-existing-audio-${Date.now()}`,
      workload: {
        audio_base64: audio.toString("base64"),
        file_name: basename(AUDIO_PATH),
        mime_type: "audio/wav",
        language: "en",
        vocabulary_context: "Avantiqo voice generator is working and ready",
      },
    },
  };
  const submission = await submitAfterGatewayPropagation(endpointId, apiKey, submissionBody);

  const jobId = text(submission.id);
  if (!jobId) throw new Error("AVANTIQO_VOICE_STT_EXISTING_AUDIO_JOB_ID_REQUIRED");

  const startedAt = Date.now();
  const deadline = startedAt + TIMEOUT_MS;
  let completed = null;
  let workerEverObserved = false;
  let inProgressEverObserved = false;
  let lastState = "UNKNOWN";
  let lastJobs = { in_queue: 0, in_progress: 0 };

  while (Date.now() < deadline) {
    const status = await request(endpointId, `/status/${encodeURIComponent(jobId)}`, apiKey);
    const state = text(status.status).toUpperCase();
    lastState = state || "UNKNOWN";
    if (state === "COMPLETED") {
      completed = status;
      break;
    }
    if (["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(state)) {
      const detail = safeDetail(status?.error || status?.message || status?.output?.error || "");
      throw new Error(`AVANTIQO_VOICE_STT_EXISTING_AUDIO_JOB_${state}${detail ? `:${detail}` : ""}`);
    }

    const [workers, health] = await Promise.all([
      controlWorkers(endpointId, managementKey),
      request(endpointId, "/health", apiKey),
    ]);
    const activeWorkers = activeWorkerCount(workers);
    if (activeWorkers > 0) workerEverObserved = true;
    lastJobs = healthJobs(health);
    if (
      ["IN_PROGRESS", "RUNNING", "PROCESSING"].includes(state) ||
      lastJobs.in_progress > 0
    ) {
      inProgressEverObserved = true;
    }

    if (!inProgressEverObserved && Date.now() - startedAt >= NO_PROGRESS_STARTUP_TIMEOUT_MS) {
      await request(endpointId, `/cancel/${encodeURIComponent(jobId)}`, apiKey, { method: "POST" }).catch(() => null);
      throw new Error(
        `AVANTIQO_VOICE_STT_EXISTING_AUDIO_JOB_NOT_CLAIMED:state=${lastState}:queue=${lastJobs.in_queue}:progress=${lastJobs.in_progress}:worker_seen=${workerEverObserved}`,
      );
    }
    await sleep(POLL_MS);
  }
  if (!completed) {
    await request(endpointId, `/cancel/${encodeURIComponent(jobId)}`, apiKey, { method: "POST" }).catch(() => null);
    throw new Error("AVANTIQO_VOICE_STT_EXISTING_AUDIO_TIMEOUT");
  }

  const output = completed.output || {};
  const transcript = text(output.transcript || output.text);
  const normalized = transcript.toLowerCase();
  const keywordMatched = normalized.includes("avantiqo") && normalized.includes("voice") && normalized.includes("ready");
  const vocabularyContextReceived = output.vocabulary_context_received === true;
  const vocabularyContextApplied = output.vocabulary_context_applied === true;
  const vocabularyContextTokenCount = Number(output.vocabulary_context_token_count) || 0;
  const passed =
    transcript.length > 0 &&
    keywordMatched &&
    text(output.capability) === "ai.speech.to.text" &&
    text(output.foundation_model) === FOUNDATION_MODEL &&
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
    transcript,
    language: text(output.language) || null,
    detected_language: text(output.detected_language) || null,
    keyword_matched: keywordMatched,
    model: text(output.model) || null,
    foundation_model: text(output.foundation_model) || null,
    vocabulary_context_received: vocabularyContextReceived,
    vocabulary_context_applied: vocabularyContextApplied,
    vocabulary_context_token_count: vocabularyContextTokenCount,
    worker_ever_observed: workerEverObserved,
    in_progress_ever_observed: inProgressEverObserved,
    raw_audio_persisted: output.raw_audio_persisted === true,
    raw_reasoning_persisted: output.raw_reasoning_persisted === true,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  };
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
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
