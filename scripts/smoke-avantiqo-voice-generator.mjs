import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const API_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VOICE_ENGINE_V1";
const REPORT_CONTRACT = "AVANTIQO_VOICE_GENERATOR_SMOKE_V1";
const DEFAULT_STT_MODEL = "openai/whisper-large-v3-turbo";
const DEFAULT_TTS_MODEL = "resemble-ai/chatterbox:multilingual-v3";
const POLL_MS = 3000;
const JOB_TIMEOUT_MS = Math.max(
  60_000,
  Math.min(20 * 60_000, Number(process.env.AVANTIQO_VOICE_SMOKE_TIMEOUT_MS || 12 * 60_000)),
);

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function safeErrorCode(error) {
  const value = text(error?.message || error).toUpperCase();
  return value.match(/(?:AVANTIQO|RUNPOD)_[A-Z0-9_]+/)?.[0] || "AVANTIQO_VOICE_SMOKE_FAILED";
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function keyKind(value) {
  return text(value).startsWith("rpa_") ? "SCOPED_RPA" : "LEGACY_OR_OTHER";
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

async function request(endpointId, requestPath, apiKey, options = {}) {
  const { response, body } = await rawRequest(endpointId, requestPath, apiKey, options);
  if (!response.ok) {
    const error = new Error(`RUNPOD_HTTP_${response.status}`);
    error.status = response.status;
    error.runpod_code = text(body?.error || body?.code || body?.status).slice(0, 160) || null;
    throw error;
  }
  return body;
}

async function probeEndpointAuthorization(endpointId, candidates) {
  const probes = [];
  for (const candidate of candidates) {
    const { response } = await rawRequest(endpointId, "/health", candidate.value);
    probes.push({
      source: candidate.source,
      key_kind: candidate.key_kind,
      http_status: response.status,
      read_authorized: response.ok,
    });
  }
  return probes;
}

function authorizedCandidateOrder(candidates, probes) {
  const authorizedSources = new Set(
    probes.filter((probe) => probe.read_authorized).map((probe) => probe.source),
  );
  const readable = candidates.filter((candidate) => authorizedSources.has(candidate.source));
  const unreadable = candidates.filter((candidate) => !authorizedSources.has(candidate.source));
  return [...readable, ...unreadable];
}

async function submitJob(endpointId, payload, candidates, laneName) {
  const attempts = [];
  for (const candidate of candidates) {
    const { response, body } = await rawRequest(endpointId, "/run", candidate.value, {
      method: "POST",
      body: { input: payload },
    });
    attempts.push({
      source: candidate.source,
      key_kind: candidate.key_kind,
      http_status: response.status,
      write_authorized: response.ok,
    });
    if (response.ok) {
      const jobId = text(body.id);
      if (!jobId) throw new Error("RUNPOD_JOB_ID_REQUIRED");
      return {
        jobId,
        apiKey: candidate.value,
        credential_source: candidate.source,
        credential_key_kind: candidate.key_kind,
        authorization_attempts: attempts,
      };
    }
    if (![401, 403].includes(response.status)) {
      throw new Error(`RUNPOD_HTTP_${response.status}`);
    }
  }
  const lane = text(laneName).toUpperCase() || "ENDPOINT";
  const error = new Error(`AVANTIQO_VOICE_RUNPOD_${lane}_ENDPOINT_PERMISSION_REQUIRED`);
  error.authorization_attempts = attempts;
  throw error;
}

async function runJob(endpointId, payload, candidates, laneName) {
  const started = performance.now();
  const submitted = await submitJob(endpointId, payload, candidates, laneName);
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const body = await request(
      endpointId,
      `/status/${encodeURIComponent(submitted.jobId)}`,
      submitted.apiKey,
    );
    const status = text(body.status).toUpperCase();
    if (status === "COMPLETED") {
      return {
        output: body.output || {},
        wall_ms: Math.round(performance.now() - started),
        credential_source: submitted.credential_source,
        credential_key_kind: submitted.credential_key_kind,
        authorization_attempts: submitted.authorization_attempts,
      };
    }
    if (["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) {
      const detail = text(body?.error || body?.message).slice(0, 300);
      throw new Error(`RUNPOD_JOB_${status}${detail ? `:${detail}` : ""}`);
    }
    await sleep(POLL_MS);
  }

  await request(
    endpointId,
    `/cancel/${encodeURIComponent(submitted.jobId)}`,
    submitted.apiKey,
    { method: "POST" },
  ).catch(() => null);
  throw new Error("RUNPOD_JOB_TIMEOUT");
}

const reportPath = resolve(
  process.env.AVANTIQO_VOICE_SMOKE_REPORT_OUTPUT || "/tmp/avantiqo-voice-generator-smoke.json",
);
const audioPath = resolve(
  process.env.AVANTIQO_VOICE_SMOKE_AUDIO_OUTPUT || "/tmp/avantiqo-voice-generator-smoke.wav",
);

const report = {
  success: false,
  contract: REPORT_CONTRACT,
  generated_at: new Date().toISOString(),
  engine_contract: CONTRACT,
  purpose: "ONE_SHOT_GENERATOR_ROUNDTRIP",
  production_web_deploy: false,
  pricing_activation_performed: false,
  provider_selection_changed: false,
  raw_reasoning_persisted: false,
  error_code: null,
  authorization: null,
  tts: null,
  stt: null,
};

try {
  const candidates = inferenceCandidates();
  const ttsEndpointId = required("RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID");
  const sttEndpointId = required("RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID");
  const ttsModel = text(process.env.AVANTIQO_VOICE_TTS_FOUNDATION_MODEL) || DEFAULT_TTS_MODEL;
  const sttModel = text(process.env.AVANTIQO_VOICE_STT_FOUNDATION_MODEL) || DEFAULT_STT_MODEL;
  const phrase = "Avantiqo voice generator is working and ready.";

  const [ttsProbes, sttProbes] = await Promise.all([
    probeEndpointAuthorization(ttsEndpointId, candidates),
    probeEndpointAuthorization(sttEndpointId, candidates),
  ]);
  report.authorization = {
    candidate_count: candidates.length,
    runpod_api_key_kind: candidates[0]?.key_kind || null,
    management_key_available_as_distinct_fallback: candidates.length > 1,
    tts: ttsProbes,
    stt: sttProbes,
  };

  if (!ttsProbes.some((probe) => probe.read_authorized)) {
    throw new Error("AVANTIQO_VOICE_RUNPOD_TTS_ENDPOINT_PERMISSION_REQUIRED");
  }
  if (!sttProbes.some((probe) => probe.read_authorized)) {
    throw new Error("AVANTIQO_VOICE_RUNPOD_STT_ENDPOINT_PERMISSION_REQUIRED");
  }

  const ttsJob = await runJob(
    ttsEndpointId,
    {
      contract: CONTRACT,
      capability: "ai.text.to.speech",
      foundation_model: ttsModel,
      organization_id: "benchmark-only",
      usage_id: `voice-smoke-tts-${Date.now()}`,
      workload: {
        text: phrase,
        language: "en",
        voice: null,
        response_format: "wav",
      },
    },
    authorizedCandidateOrder(candidates, ttsProbes),
    "TTS",
  );

  const ttsOutput = ttsJob.output || {};
  const audioBase64 = text(ttsOutput.audio_base64);
  const audio = Buffer.from(audioBase64, "base64");
  const wavHeader = audio.subarray(0, 4).toString("ascii");
  const ttsPassed =
    audio.length > 1000 &&
    wavHeader === "RIFF" &&
    text(ttsOutput.format).toLowerCase() === "wav" &&
    ttsOutput.voice_cloning_used === false &&
    ttsOutput.raw_reasoning_persisted === false;

  await mkdir(dirname(audioPath), { recursive: true });
  await writeFile(audioPath, audio);

  report.tts = {
    passed: ttsPassed,
    wall_ms: ttsJob.wall_ms,
    worker_generation_seconds: Number(ttsOutput.generation_seconds) || null,
    audio_bytes: audio.length,
    sample_rate: Number(ttsOutput.sample_rate) || null,
    format: text(ttsOutput.format).toLowerCase() || null,
    model: text(ttsOutput.model) || null,
    foundation_model: text(ttsOutput.foundation_model) || ttsModel,
    voice_profile: text(ttsOutput.voice_profile) || null,
    voice_cloning_used: ttsOutput.voice_cloning_used === true,
    inference_credential_source: ttsJob.credential_source,
    inference_credential_key_kind: ttsJob.credential_key_kind,
    authorization_attempts: ttsJob.authorization_attempts,
  };
  if (!ttsPassed) throw new Error("AVANTIQO_VOICE_TTS_SMOKE_INVALID_OUTPUT");

  const sttJob = await runJob(
    sttEndpointId,
    {
      contract: CONTRACT,
      capability: "ai.speech.to.text",
      foundation_model: sttModel,
      organization_id: "benchmark-only",
      usage_id: `voice-smoke-stt-${Date.now()}`,
      workload: {
        audio_base64: audio.toString("base64"),
        file_name: "avantiqo-voice-generator-smoke.wav",
        mime_type: "audio/wav",
        language: "en",
        vocabulary_context: "Avantiqo business operating system",
      },
    },
    authorizedCandidateOrder(candidates, sttProbes),
    "STT",
  );

  const sttOutput = sttJob.output || {};
  const transcript = text(sttOutput.transcript || sttOutput.text);
  const normalized = transcript.toLowerCase();
  const keywordMatched = normalized.includes("voice") && normalized.includes("generator");
  const sttPassed =
    transcript.length > 0 &&
    keywordMatched &&
    sttOutput.raw_audio_persisted === false &&
    sttOutput.raw_reasoning_persisted === false;

  report.stt = {
    passed: sttPassed,
    wall_ms: sttJob.wall_ms,
    worker_generation_seconds: Number(sttOutput.generation_seconds) || null,
    transcript,
    keyword_matched: keywordMatched,
    model: text(sttOutput.model) || null,
    foundation_model: text(sttOutput.foundation_model) || sttModel,
    inference_credential_source: sttJob.credential_source,
    inference_credential_key_kind: sttJob.credential_key_kind,
    authorization_attempts: sttJob.authorization_attempts,
  };
  if (!sttPassed) throw new Error("AVANTIQO_VOICE_STT_SMOKE_INVALID_OUTPUT");

  report.success = true;
} catch (error) {
  report.error_code = safeErrorCode(error);
  if (Array.isArray(error?.authorization_attempts)) {
    report.authorization = {
      ...(report.authorization || {}),
      write_authorization_attempts: error.authorization_attempts,
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
  authorization: report.authorization,
  tts: report.tts,
  stt: report.stt,
  audio_output_written: Boolean(report.tts?.passed),
  production_web_deploy: false,
  pricing_activation_performed: false,
}, null, 2));
