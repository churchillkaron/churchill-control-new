import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const API_BASE = "https://api.runpod.ai/v2";
const ENGINE_CONTRACT = "AVANTIQO_VOICE_ENGINE_V1";
const LOCK_CONTRACT = "AVANTIQO_VOICE_TTS_CONTROLLED_GENERATION_V1";
const RESUME_CONTRACT = "AVANTIQO_VOICE_TTS_CONTROLLED_GENERATION_RESUME_V1";
const LOCK_PATH = resolve("audits/results/avantiqo-voice-tts-controlled-generation.json");
const REPORT_PATH = resolve(
  process.env.AVANTIQO_VOICE_TTS_RESUME_REPORT_OUTPUT ||
  "/tmp/avantiqo-voice-tts-controlled-generation-resume.json",
);
const AUDIO_PATH = resolve(
  process.env.AVANTIQO_VOICE_TTS_COLD_START_AUDIO_OUTPUT ||
  "/tmp/avantiqo-voice-tts-cold-start-smoke.wav",
);
const POLL_MS = Math.max(
  3000,
  Math.min(30_000, Number(process.env.AVANTIQO_VOICE_TTS_RESUME_POLL_MS || 5000)),
);
const WAIT_MS = Math.max(
  60_000,
  Math.min(60 * 60_000, Number(process.env.AVANTIQO_VOICE_TTS_RESUME_WAIT_MS || 30 * 60_000)),
);

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function keyKind(value) {
  return text(value).startsWith("rpa_") ? "SCOPED_RPA" : "LEGACY_OR_OTHER";
}

function credentialCandidates() {
  const primary = required("RUNPOD_API_KEY");
  const management = text(process.env.RUNPOD_MANAGEMENT_API_KEY);
  const candidates = [
    { source: "RUNPOD_API_KEY", value: primary, key_kind: keyKind(primary) },
  ];
  if (management && management !== primary) {
    candidates.push({
      source: "RUNPOD_MANAGEMENT_API_KEY_READ_ONLY_FALLBACK",
      value: management,
      key_kind: keyKind(management),
    });
  }
  return candidates;
}

async function rawRequest(endpointId, requestPath, apiKey) {
  const response = await fetch(`${API_BASE}/${encodeURIComponent(endpointId)}${requestPath}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  return { response, body: body || {} };
}

async function readWithCandidates(endpointId, requestPath, candidates) {
  const attempts = [];
  for (const candidate of candidates) {
    const { response, body } = await rawRequest(endpointId, requestPath, candidate.value);
    attempts.push({
      source: candidate.source,
      key_kind: candidate.key_kind,
      http_status: response.status,
      read_authorized: response.ok,
    });
    if (response.ok) return { body, candidate, attempts };
    if (![401, 403].includes(response.status)) {
      const detail = text(body?.error || body?.message || body?.detail).slice(0, 300);
      throw new Error(`RUNPOD_HTTP_${response.status}${detail ? `:${detail}` : ""}`);
    }
  }
  const error = new Error("AVANTIQO_VOICE_TTS_RESUME_READ_PERMISSION_REQUIRED");
  error.authorization_attempts = attempts;
  throw error;
}

function healthSummary(body = {}) {
  const jobs = body?.jobs && typeof body.jobs === "object" ? body.jobs : {};
  const workers = body?.workers && typeof body.workers === "object" ? body.workers : {};
  return {
    jobs: {
      in_queue: Number(jobs.inQueue ?? jobs.in_queue ?? 0) || 0,
      in_progress: Number(jobs.inProgress ?? jobs.in_progress ?? 0) || 0,
      completed: Number(jobs.completed ?? 0) || 0,
      failed: Number(jobs.failed ?? 0) || 0,
      retried: Number(jobs.retried ?? 0) || 0,
    },
    workers: {
      idle: Number(workers.idle ?? 0) || 0,
      initializing: Number(workers.initializing ?? 0) || 0,
      ready: Number(workers.ready ?? 0) || 0,
      running: Number(workers.running ?? 0) || 0,
      throttled: Number(workers.throttled ?? 0) || 0,
      unhealthy: Number(workers.unhealthy ?? 0) || 0,
    },
  };
}

async function writeReport(report) {
  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function playAudio(pathname) {
  if (process.platform !== "darwin") return false;
  const result = spawnSync("afplay", [pathname], {
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error || result.status !== 0) {
    throw result.error || new Error(`AVANTIQO_VOICE_TTS_RESUME_AFPLAY_FAILED:exit=${result.status}`);
  }
  return true;
}

const lock = JSON.parse(await readFile(LOCK_PATH, "utf8"));
if (lock?.contract !== LOCK_CONTRACT) throw new Error("AVANTIQO_VOICE_TTS_RESUME_LOCK_CONTRACT_MISMATCH");
if (lock?.generation_submitted !== true) throw new Error("AVANTIQO_VOICE_TTS_RESUME_SUBMITTED_LOCK_REQUIRED");
if (Number(lock?.accepted_generation_count) !== 1) throw new Error("AVANTIQO_VOICE_TTS_RESUME_EXACTLY_ONE_ACCEPTED_GENERATION_REQUIRED");
if (lock?.new_generation_allowed !== false) throw new Error("AVANTIQO_VOICE_TTS_RESUME_NEW_GENERATION_MUST_BE_LOCKED");
if (lock?.stt_submitted !== false) throw new Error("AVANTIQO_VOICE_TTS_RESUME_STT_MUST_BE_FALSE");

const endpointId = text(lock?.endpoint_id);
const jobId = text(lock?.job_id);
if (!endpointId) throw new Error("AVANTIQO_VOICE_TTS_RESUME_ENDPOINT_ID_REQUIRED");
if (!jobId) throw new Error("AVANTIQO_VOICE_TTS_RESUME_JOB_ID_REQUIRED");

const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID);
if (configuredEndpointId && configuredEndpointId !== endpointId) {
  throw new Error("AVANTIQO_VOICE_TTS_RESUME_ENDPOINT_ENV_MISMATCH");
}

const candidates = credentialCandidates();
const report = {
  success: false,
  contract: RESUME_CONTRACT,
  generated_at: new Date().toISOString(),
  lock_contract: lock.contract,
  endpoint_id: endpointId,
  endpoint_name: text(lock.endpoint_name) || null,
  job_id: jobId,
  accepted_generation_count: 1,
  new_generation_submitted: false,
  new_generation_allowed: false,
  stt_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  final_status: null,
  health_last: null,
  authorization: null,
  tts: null,
  audio_path: null,
  audio_played: false,
  error_code: null,
};

console.log(JSON.stringify({
  event: "AVANTIQO_VOICE_TTS_RESUME_BEGIN",
  contract: RESUME_CONTRACT,
  endpoint_id: endpointId,
  job_id: jobId,
  accepted_generation_count: 1,
  new_generation_submitted: false,
  new_generation_allowed: false,
  stt_submitted: false,
  read_only_runpod_operations: true,
  secrets_printed: false,
}));

const started = performance.now();
const deadline = Date.now() + WAIT_MS;
let lastProgressAt = 0;
let lastStatus = "UNKNOWN";

try {
  while (Date.now() < deadline) {
    const statusRead = await readWithCandidates(
      endpointId,
      `/status/${encodeURIComponent(jobId)}`,
      candidates,
    );
    const status = text(statusRead.body?.status).toUpperCase() || "UNKNOWN";
    lastStatus = status;
    report.authorization = {
      status_read_attempts: statusRead.attempts,
      credential_source: statusRead.candidate.source,
      credential_key_kind: statusRead.candidate.key_kind,
    };

    let health = null;
    try {
      const healthRead = await readWithCandidates(endpointId, "/health", candidates);
      health = healthSummary(healthRead.body);
      report.health_last = health;
    } catch {
      health = report.health_last;
    }

    const elapsedMs = Math.round(performance.now() - started);
    if (Date.now() - lastProgressAt >= 15_000 || ["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) {
      console.log(JSON.stringify({
        event: "AVANTIQO_VOICE_TTS_RESUME_PROGRESS",
        job_id: jobId,
        status,
        elapsed_seconds: Math.round(elapsedMs / 1000),
        health,
        new_generation_submitted: false,
        stt_submitted: false,
        secrets_printed: false,
      }));
      lastProgressAt = Date.now();
    }

    if (status === "COMPLETED") {
      const output = statusRead.body?.output || {};
      const model = text(lock?.foundation_model) || "resemble-ai/chatterbox:multilingual-v3";
      const audio = Buffer.from(text(output.audio_base64), "base64");
      const wavHeader = audio.subarray(0, 4).toString("ascii");
      const outputContract = text(output.contract || output.engine_contract);
      const capability = text(output.capability);
      const foundationModel = text(output.foundation_model) || model;
      const passed =
        audio.length > 1000 &&
        wavHeader === "RIFF" &&
        text(output.format).toLowerCase() === "wav" &&
        capability === "ai.text.to.speech" &&
        foundationModel === model &&
        output.voice_cloning_used === false &&
        output.raw_reasoning_persisted === false &&
        (!outputContract || outputContract === ENGINE_CONTRACT);

      await mkdir(dirname(AUDIO_PATH), { recursive: true });
      await writeFile(AUDIO_PATH, audio);

      report.final_status = status;
      report.tts = {
        passed,
        wall_ms_from_resume: elapsedMs,
        worker_generation_seconds: Number(output.generation_seconds) || null,
        audio_bytes: audio.length,
        wav_header: wavHeader,
        sample_rate: Number(output.sample_rate) || null,
        format: text(output.format).toLowerCase() || null,
        capability: capability || null,
        engine_contract: outputContract || ENGINE_CONTRACT,
        model: text(output.model) || null,
        foundation_model: foundationModel,
        voice_profile: text(output.voice_profile) || null,
        voice_cloning_used: output.voice_cloning_used === true,
        raw_reasoning_persisted: output.raw_reasoning_persisted === true,
      };
      report.audio_path = AUDIO_PATH;
      if (!passed) throw new Error("AVANTIQO_VOICE_TTS_RESUME_INVALID_OUTPUT");
      report.audio_played = playAudio(AUDIO_PATH);
      report.success = true;
      await writeReport(report);
      console.log(JSON.stringify({
        event: "AVANTIQO_VOICE_TTS_RESUME_COMPLETED",
        job_id: jobId,
        tts_passed: true,
        audio_path: AUDIO_PATH,
        audio_bytes: audio.length,
        audio_played: report.audio_played,
        accepted_generation_count: 1,
        new_generation_submitted: false,
        stt_submitted: false,
        production_deploy_performed: false,
        pricing_activation_performed: false,
        secrets_printed: false,
      }));
      console.log(`AVANTIQO_VOICE_TTS_RESUME_REPORT=${REPORT_PATH}`);
      console.log(`AVANTIQO_VOICE_TTS_COLD_START_AUDIO=${AUDIO_PATH}`);
      process.exit(0);
    }

    if (["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) {
      const detail = text(statusRead.body?.error || statusRead.body?.message).slice(0, 500);
      throw new Error(`RUNPOD_JOB_${status}${detail ? `:${detail}` : ""}`);
    }

    await sleep(POLL_MS);
  }

  throw new Error(`AVANTIQO_VOICE_TTS_RESUME_WAIT_TIMEOUT:${lastStatus}`);
} catch (error) {
  report.final_status = lastStatus;
  report.error_code = text(error?.message || error).match(/(?:AVANTIQO|RUNPOD)_[A-Z0-9_]+/)?.[0] || "AVANTIQO_VOICE_TTS_RESUME_FAILED";
  await writeReport(report);
  console.log(JSON.stringify({
    event: "AVANTIQO_VOICE_TTS_RESUME_FAILED",
    job_id: jobId,
    status: lastStatus,
    error_code: report.error_code,
    accepted_generation_count: 1,
    new_generation_submitted: false,
    new_generation_allowed: false,
    stt_submitted: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  }));
  console.log(`AVANTIQO_VOICE_TTS_RESUME_REPORT=${REPORT_PATH}`);
  process.exitCode = 1;
}
