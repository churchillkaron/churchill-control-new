import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const API_BASE = "https://api.runpod.ai/v2";
const ENGINE_CONTRACT = "AVANTIQO_VOICE_ENGINE_V1";
const REPORT_CONTRACT = "AVANTIQO_VOICE_TTS_COLD_START_SMOKE_V1";
const DEFAULT_TTS_MODEL = "resemble-ai/chatterbox:multilingual-v3";
const POLL_MS = 3000;
const SUBMIT_TIMEOUT_MS = 12_000;
const JOB_TIMEOUT_MS = Math.max(
  60_000,
  Math.min(20 * 60_000, Number(process.env.AVANTIQO_VOICE_TTS_COLD_START_TIMEOUT_MS || 15 * 60_000)),
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

function safeErrorCode(error) {
  const value = text(error?.message || error).toUpperCase();
  return value.match(/(?:AVANTIQO|RUNPOD)_[A-Z0-9_]+/)?.[0] || "AVANTIQO_VOICE_TTS_COLD_START_SMOKE_FAILED";
}

function inferenceCandidates() {
  const primary = required("RUNPOD_API_KEY");
  const management = text(process.env.RUNPOD_MANAGEMENT_API_KEY);
  const candidates = [
    { source: "RUNPOD_API_KEY", value: primary, key_kind: keyKind(primary) },
  ];
  if (management && management !== primary) {
    candidates.push({
      source: "RUNPOD_MANAGEMENT_API_KEY_CERTIFICATION_FALLBACK",
      value: management,
      key_kind: keyKind(management),
    });
  }
  return candidates;
}

async function rawRequest(endpointId, requestPath, apiKey, options = {}) {
  const response = await fetch(`${API_BASE}/${encodeURIComponent(endpointId)}${requestPath}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(Math.max(1000, Number(options.timeoutMs || 30_000))),
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

async function request(endpointId, requestPath, apiKey, options = {}) {
  const { response, body } = await rawRequest(endpointId, requestPath, apiKey, options);
  if (!response.ok) {
    const detail = text(body?.error || body?.message || body?.detail).slice(0, 240);
    throw new Error(`RUNPOD_HTTP_${response.status}${detail ? `:${detail}` : ""}`);
  }
  return body;
}

async function readHealth(endpointId, candidates) {
  const attempts = [];
  for (const candidate of candidates) {
    const { response, body } = await rawRequest(endpointId, "/health", candidate.value);
    attempts.push({
      source: candidate.source,
      key_kind: candidate.key_kind,
      http_status: response.status,
      read_authorized: response.ok,
    });
    if (response.ok) return { body, candidate, attempts };
    if (![401, 403].includes(response.status)) {
      throw new Error(`RUNPOD_HTTP_${response.status}`);
    }
  }
  const error = new Error("AVANTIQO_VOICE_TTS_COLD_START_HEALTH_PERMISSION_REQUIRED");
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

async function submitExactlyOne(endpointId, payload, candidates) {
  const attempts = [];
  for (const candidate of candidates) {
    console.log(JSON.stringify({
      event: "AVANTIQO_VOICE_TTS_COLD_START_SUBMIT_ATTEMPT",
      credential_source: candidate.source,
      credential_key_kind: candidate.key_kind,
      secret_values_printed: false,
    }));

    let response;
    let body;
    try {
      ({ response, body } = await rawRequest(endpointId, "/run", candidate.value, {
        method: "POST",
        body: { input: payload },
        timeoutMs: SUBMIT_TIMEOUT_MS,
      }));
    } catch (error) {
      attempts.push({
        source: candidate.source,
        key_kind: candidate.key_kind,
        http_status: null,
        write_authorized: false,
        transport_error: error?.name === "TimeoutError" ? "TIMEOUT" : "REQUEST_FAILED",
      });
      continue;
    }

    attempts.push({
      source: candidate.source,
      key_kind: candidate.key_kind,
      http_status: response.status,
      write_authorized: response.ok,
    });

    console.log(JSON.stringify({
      event: "AVANTIQO_VOICE_TTS_COLD_START_SUBMIT_RESULT",
      credential_source: candidate.source,
      http_status: response.status,
      write_authorized: response.ok,
    }));

    if (response.ok) {
      const jobId = text(body.id);
      if (!jobId) throw new Error("RUNPOD_JOB_ID_REQUIRED");
      console.log(JSON.stringify({
        event: "AVANTIQO_VOICE_TTS_COLD_START_JOB_SUBMITTED",
        job_id: jobId,
        credential_source: candidate.source,
        new_job_count: 1,
      }));
      return {
        job_id: jobId,
        api_key: candidate.value,
        credential_source: candidate.source,
        credential_key_kind: candidate.key_kind,
        authorization_attempts: attempts,
      };
    }

    if (![401, 403].includes(response.status)) {
      const error = new Error(`RUNPOD_HTTP_${response.status}`);
      error.authorization_attempts = attempts;
      throw error;
    }
  }

  const error = new Error("AVANTIQO_VOICE_RUNPOD_TTS_ENDPOINT_PERMISSION_REQUIRED");
  error.authorization_attempts = attempts;
  throw error;
}

async function waitForJob(endpointId, submitted) {
  const started = performance.now();
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  let lastStatus = "UNKNOWN";
  let lastProgressAt = 0;

  while (Date.now() < deadline) {
    const body = await request(
      endpointId,
      `/status/${encodeURIComponent(submitted.job_id)}`,
      submitted.api_key,
    );
    const status = text(body.status).toUpperCase() || "UNKNOWN";
    lastStatus = status;
    const elapsedMs = Math.round(performance.now() - started);

    if (Date.now() - lastProgressAt >= 15_000 || status === "COMPLETED") {
      console.log(JSON.stringify({
        event: "AVANTIQO_VOICE_TTS_COLD_START_PROGRESS",
        job_id: submitted.job_id,
        status,
        elapsed_seconds: Math.round(elapsedMs / 1000),
      }));
      lastProgressAt = Date.now();
    }

    if (status === "COMPLETED") {
      return { body, wall_ms: elapsedMs };
    }
    if (["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) {
      const detail = text(body?.error || body?.message).slice(0, 300);
      throw new Error(`RUNPOD_JOB_${status}${detail ? `:${detail}` : ""}`);
    }
    await sleep(POLL_MS);
  }

  await request(
    endpointId,
    `/cancel/${encodeURIComponent(submitted.job_id)}`,
    submitted.api_key,
    { method: "POST" },
  ).catch(() => null);
  throw new Error(`RUNPOD_JOB_TIMEOUT:${lastStatus}`);
}

const reportPath = resolve(
  process.env.AVANTIQO_VOICE_TTS_COLD_START_REPORT_OUTPUT ||
  "/tmp/avantiqo-voice-tts-cold-start-smoke.json",
);
const audioPath = resolve(
  process.env.AVANTIQO_VOICE_TTS_COLD_START_AUDIO_OUTPUT ||
  "/tmp/avantiqo-voice-tts-cold-start-smoke.wav",
);

const report = {
  success: false,
  contract: REPORT_CONTRACT,
  generated_at: new Date().toISOString(),
  engine_contract: ENGINE_CONTRACT,
  purpose: "ONE_CONTROLLED_TTS_COLD_START_ONLY",
  tts_only: true,
  new_job_limit: 1,
  generation_submitted: false,
  stt_submitted: false,
  production_web_deploy: false,
  pricing_activation_performed: false,
  provider_selection_changed: false,
  raw_reasoning_persisted: false,
  error_code: null,
  authorization: null,
  health_before: null,
  job_id: null,
  tts: null,
};

let submitted = null;
try {
  const endpointId = required("RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID");
  const model = text(process.env.AVANTIQO_VOICE_TTS_FOUNDATION_MODEL) || DEFAULT_TTS_MODEL;
  const candidates = inferenceCandidates();
  const healthRead = await readHealth(endpointId, candidates);
  const health = healthSummary(healthRead.body);
  report.health_before = health;
  report.authorization = {
    candidate_count: candidates.length,
    candidates: candidates.map((candidate) => ({
      source: candidate.source,
      key_kind: candidate.key_kind,
    })),
    health_read_attempts: healthRead.attempts,
  };

  if (health.jobs.in_queue > 0 || health.jobs.in_progress > 0) {
    throw new Error(
      `AVANTIQO_VOICE_TTS_COLD_START_EXISTING_JOB_BLOCKS_SUBMISSION:in_queue=${health.jobs.in_queue}:in_progress=${health.jobs.in_progress}`,
    );
  }

  console.log(JSON.stringify({
    event: "AVANTIQO_VOICE_TTS_COLD_START_BEGIN",
    endpoint_configured: true,
    health_before: health,
    job_timeout_seconds: Math.round(JOB_TIMEOUT_MS / 1000),
    exactly_one_new_job_allowed: true,
    stt_submitted: false,
    production_web_deploy: false,
    pricing_activation_performed: false,
    secret_values_printed: false,
  }));

  submitted = await submitExactlyOne(
    endpointId,
    {
      contract: ENGINE_CONTRACT,
      capability: "ai.text.to.speech",
      foundation_model: model,
      organization_id: "benchmark-only",
      usage_id: `voice-tts-cold-start-${Date.now()}`,
      workload: {
        text: "Avantiqo voice generator is working and ready.",
        language: "en",
        voice: null,
        response_format: "wav",
      },
    },
    candidates,
  );
  report.generation_submitted = true;
  report.job_id = submitted.job_id;
  report.authorization.tts_write_attempts = submitted.authorization_attempts;

  const completed = await waitForJob(endpointId, submitted);
  const output = completed.body?.output || {};
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

  await mkdir(dirname(audioPath), { recursive: true });
  await writeFile(audioPath, audio);

  report.tts = {
    passed,
    wall_ms: completed.wall_ms,
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
    inference_credential_source: submitted.credential_source,
    inference_credential_key_kind: submitted.credential_key_kind,
  };

  if (!passed) throw new Error("AVANTIQO_VOICE_TTS_COLD_START_INVALID_OUTPUT");
  report.success = true;
} catch (error) {
  report.error_code = safeErrorCode(error);
  if (Array.isArray(error?.authorization_attempts)) {
    report.authorization = {
      ...(report.authorization || {}),
      failed_write_attempts: error.authorization_attempts,
    };
  }
  process.exitCode = 1;
}

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  success: report.success,
  contract: report.contract,
  error_code: report.error_code,
  job_id: report.job_id,
  generation_submitted: report.generation_submitted,
  new_job_limit: report.new_job_limit,
  stt_submitted: report.stt_submitted,
  authorization: report.authorization,
  health_before: report.health_before,
  tts: report.tts,
  audio_output_written: Boolean(report.tts?.passed),
  production_web_deploy: false,
  pricing_activation_performed: false,
}, null, 2));
console.log(`AVANTIQO_VOICE_TTS_COLD_START_REPORT=${reportPath}`);
if (report.tts?.passed) console.log(`AVANTIQO_VOICE_TTS_COLD_START_AUDIO=${audioPath}`);