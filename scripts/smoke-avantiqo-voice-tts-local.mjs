import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const API_BASE = "https://api.runpod.ai/v2";
const ENGINE_CONTRACT = "AVANTIQO_VOICE_ENGINE_V1";
const REPORT_CONTRACT = "AVANTIQO_VOICE_TTS_SMOKE_V1";
const DEFAULT_FOUNDATION_MODEL = "resemble-ai/chatterbox:multilingual-v3";
const POLL_MS = 3000;
const SUBMIT_TIMEOUT_MS = 12_000;
const JOB_TIMEOUT_MS = Math.max(
  60_000,
  Math.min(12 * 60_000, Number(process.env.AVANTIQO_VOICE_TTS_SMOKE_TIMEOUT_MS || 8 * 60_000)),
);

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function keyKind(value) {
  return text(value).startsWith("rpa_") ? "SCOPED_RPA" : "LEGACY_OR_OTHER";
}

function candidates() {
  const primary = required("RUNPOD_API_KEY");
  const management = text(process.env.RUNPOD_MANAGEMENT_API_KEY);
  const items = [{ source: "RUNPOD_API_KEY", value: primary, key_kind: keyKind(primary) }];
  if (management && management !== primary) {
    items.push({
      source: "RUNPOD_MANAGEMENT_API_KEY_CERTIFICATION_FALLBACK",
      value: management,
      key_kind: keyKind(management),
    });
  }
  return items;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function request(endpointId, path, credential, options = {}) {
  const response = await fetch(`${API_BASE}/${encodeURIComponent(endpointId)}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
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

async function submit(endpointId, payload, items) {
  const attempts = [];
  for (const candidate of items) {
    console.log(JSON.stringify({
      event: "AVANTIQO_VOICE_TTS_SMOKE_SUBMIT_ATTEMPT",
      credential_source: candidate.source,
      credential_key_kind: candidate.key_kind,
      secret_values_printed: false,
    }));

    const { response, body } = await request(endpointId, "/run", candidate.value, {
      method: "POST",
      body: { input: payload },
      timeoutMs: SUBMIT_TIMEOUT_MS,
    });
    attempts.push({
      source: candidate.source,
      key_kind: candidate.key_kind,
      http_status: response.status,
      write_authorized: response.ok,
    });
    console.log(JSON.stringify({
      event: "AVANTIQO_VOICE_TTS_SMOKE_SUBMIT_RESULT",
      credential_source: candidate.source,
      http_status: response.status,
      write_authorized: response.ok,
    }));

    if (response.ok) {
      const jobId = text(body.id);
      if (!jobId) throw new Error("RUNPOD_JOB_ID_REQUIRED");
      return { jobId, candidate, attempts };
    }
    if (![401, 403].includes(response.status)) {
      throw new Error(`RUNPOD_HTTP_${response.status}`);
    }
  }
  const error = new Error("AVANTIQO_VOICE_RUNPOD_TTS_ENDPOINT_PERMISSION_REQUIRED");
  error.authorization_attempts = attempts;
  throw error;
}

const endpointId = required("RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID");
const model = text(process.env.AVANTIQO_VOICE_TTS_FOUNDATION_MODEL) || DEFAULT_FOUNDATION_MODEL;
const reportPath = resolve(
  process.env.AVANTIQO_VOICE_TTS_SMOKE_REPORT_OUTPUT || "/tmp/avantiqo-voice-tts-smoke.json",
);
const audioPath = resolve(
  process.env.AVANTIQO_VOICE_TTS_SMOKE_AUDIO_OUTPUT || "/tmp/avantiqo-voice-tts-smoke.wav",
);
const phrase = "Avantiqo voice generation is working.";
const result = {
  success: false,
  contract: REPORT_CONTRACT,
  generated_at: new Date().toISOString(),
  engine_contract: ENGINE_CONTRACT,
  endpoint_configured: true,
  foundation_model: model,
  authorization_attempts: [],
  job_id: null,
  status: null,
  wall_ms: null,
  audio_bytes: null,
  sample_rate: null,
  format: null,
  voice_cloning_used: null,
  raw_reasoning_persisted: null,
  inference_credential_source: null,
  error_code: null,
  generation_submitted: false,
  stt_generation_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_in_output: false,
};

try {
  const credentialCandidates = candidates();
  console.log(JSON.stringify({
    event: "AVANTIQO_VOICE_TTS_SMOKE_START",
    candidate_count: credentialCandidates.length,
    submit_timeout_seconds: Math.round(SUBMIT_TIMEOUT_MS / 1000),
    job_timeout_seconds: Math.round(JOB_TIMEOUT_MS / 1000),
    stt_generation_submitted: false,
    secret_values_printed: false,
  }));

  const submitted = await submit(
    endpointId,
    {
      contract: ENGINE_CONTRACT,
      capability: "ai.text.to.speech",
      foundation_model: model,
      organization_id: "benchmark-only",
      usage_id: `voice-tts-smoke-${Date.now()}`,
      workload: {
        text: phrase,
        language: "en",
        voice: null,
        response_format: "wav",
      },
    },
    credentialCandidates,
  );

  result.generation_submitted = true;
  result.job_id = submitted.jobId;
  result.authorization_attempts = submitted.attempts;
  result.inference_credential_source = submitted.candidate.source;
  console.log(JSON.stringify({
    event: "AVANTIQO_VOICE_TTS_SMOKE_JOB_SUBMITTED",
    job_id: submitted.jobId,
    credential_source: submitted.candidate.source,
  }));

  const started = performance.now();
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  let lastProgressAt = 0;
  let output = null;

  while (Date.now() < deadline) {
    const { response, body } = await request(
      endpointId,
      `/status/${encodeURIComponent(submitted.jobId)}`,
      submitted.candidate.value,
    );
    if (!response.ok) throw new Error(`RUNPOD_HTTP_${response.status}`);
    const status = text(body.status).toUpperCase();
    result.status = status || null;
    const elapsedMs = Math.round(performance.now() - started);

    if (Date.now() - lastProgressAt >= 12_000 || status === "COMPLETED") {
      console.log(JSON.stringify({
        event: "AVANTIQO_VOICE_TTS_SMOKE_PROGRESS",
        job_id: submitted.jobId,
        status: status || "UNKNOWN",
        elapsed_seconds: Math.round(elapsedMs / 1000),
      }));
      lastProgressAt = Date.now();
    }

    if (status === "COMPLETED") {
      result.wall_ms = elapsedMs;
      output = body.output || {};
      break;
    }
    if (["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) {
      const detail = text(body.error || body.message).slice(0, 300);
      throw new Error(`RUNPOD_JOB_${status}${detail ? `:${detail}` : ""}`);
    }
    await sleep(POLL_MS);
  }

  if (!output) throw new Error("RUNPOD_JOB_TIMEOUT");

  const audio = Buffer.from(text(output.audio_base64), "base64");
  const valid =
    audio.length > 1000 &&
    audio.subarray(0, 4).toString("ascii") === "RIFF" &&
    text(output.format).toLowerCase() === "wav" &&
    output.voice_cloning_used === false &&
    output.raw_reasoning_persisted === false;
  if (!valid) throw new Error("AVANTIQO_VOICE_TTS_SMOKE_INVALID_OUTPUT");

  await mkdir(dirname(audioPath), { recursive: true });
  await writeFile(audioPath, audio);
  result.audio_bytes = audio.length;
  result.sample_rate = Number(output.sample_rate) || null;
  result.format = text(output.format).toLowerCase() || null;
  result.voice_cloning_used = output.voice_cloning_used;
  result.raw_reasoning_persisted = output.raw_reasoning_persisted;
  result.success = true;
} catch (error) {
  result.error_code = text(error?.message || error).split(":", 1)[0] || "AVANTIQO_VOICE_TTS_SMOKE_FAILED";
  if (Array.isArray(error?.authorization_attempts)) {
    result.authorization_attempts = error.authorization_attempts;
  }
  process.exitCode = 1;
}

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result, null, 2));
