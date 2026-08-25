import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST = "https://rest.runpod.io/v1";
const QUEUE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VOICE_TTS_FRESH_JOB_RESUME_V1";
const ENDPOINT_ID = "d7zzs3609cn5un";
const ENDPOINT_NAME = "avantiqo-voice-tts-v1-recovery-20260825";
const JOB_ID = "28aa9f37-f926-4c8a-845c-51efcf507c17-e2";
const FOUNDATION = "resemble-ai/chatterbox:multilingual-v3";
const CERTIFIED_IMAGE = "ghcr.io/churchillkaron/avantiqo-voice-tts-worker@sha256:c9ce291cc27bb7de119cf1120a92dd6466962b6d79fd5728a1266a743bad1a06";
const AUDIO_PATH = process.env.AVANTIQO_VOICE_TTS_FRESH_RECOVERY_AUDIO || path.join(os.homedir(), "Downloads", "avantiqo-voice-tts-blackwell.wav");
const REPORT_PATH = process.env.AVANTIQO_VOICE_TTS_FRESH_RESUME_REPORT || "/tmp/avantiqo-voice-tts-fresh-job-resume.json";
const POLL_MS = 3000;
const TIMEOUT_MS = Math.max(60_000, Math.min(30 * 60_000, Number(process.env.AVANTIQO_VOICE_TTS_FRESH_RESUME_TIMEOUT_MS || 20 * 60_000)));

function text(value) {
  return String(value ?? "").trim();
}

function requiredEither() {
  const inference = text(process.env.RUNPOD_API_KEY);
  const management = text(process.env.RUNPOD_MANAGEMENT_API_KEY);
  if (!inference && !management) throw new Error("RUNPOD_API_KEY_OR_MANAGEMENT_API_KEY_REQUIRED");
  return { inference, management };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rawJson(url, credential, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
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
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 800);
    const error = new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
    error.httpStatus = response.status;
    throw error;
  }
  return body || {};
}

async function queueRead(pathname, credentials) {
  const candidates = [...new Set([credentials.inference, credentials.management].filter(Boolean))];
  let lastError = null;
  for (const credential of candidates) {
    try {
      return await rawJson(`${QUEUE}/${encodeURIComponent(ENDPOINT_ID)}${pathname}`, credential);
    } catch (error) {
      lastError = error;
      if (![401, 403].includes(Number(error?.httpStatus))) throw error;
    }
  }
  throw lastError || new Error("RUNPOD_VOICE_TTS_FRESH_RESUME_QUEUE_PERMISSION_REQUIRED");
}

async function restEndpoint(credentials) {
  const credential = credentials.management || credentials.inference;
  return rawJson(`${REST}/endpoints/${encodeURIComponent(ENDPOINT_ID)}`, credential);
}

async function ensureWorkersMinZero(credentials) {
  const credential = credentials.management;
  if (!credential) return { verified: false, mutation_performed: false, reason: "MANAGEMENT_KEY_UNAVAILABLE" };
  let endpoint = await restEndpoint(credentials);
  if (text(endpoint?.id) !== ENDPOINT_ID || text(endpoint?.name) !== ENDPOINT_NAME) {
    throw new Error("AVANTIQO_VOICE_TTS_FRESH_RESUME_ENDPOINT_MISMATCH");
  }
  let mutationPerformed = false;
  if (Number(endpoint?.workersMin) !== 0) {
    await rawJson(`${REST}/endpoints/${encodeURIComponent(ENDPOINT_ID)}`, credential, {
      method: "PATCH",
      body: { workersMin: 0 },
    });
    mutationPerformed = true;
    endpoint = await restEndpoint(credentials);
  }
  if (Number(endpoint?.workersMin) !== 0) {
    throw new Error("AVANTIQO_VOICE_TTS_FRESH_RESUME_WORKERS_MIN_ZERO_VERIFY_FAILED");
  }
  return { verified: true, mutation_performed: mutationPerformed, workers_min: 0 };
}

function validateCompletedOutput(body = {}) {
  const output = body?.output || {};
  const audio = Buffer.from(text(output?.audio_base64), "base64");
  const wavHeader = audio.subarray(0, 4).toString("ascii");
  const capability = text(output?.capability);
  const foundation = text(output?.foundation_model) || FOUNDATION;
  const format = text(output?.format).toLowerCase();
  const contract = text(output?.contract || output?.engine_contract);
  const passed =
    audio.length > 1000 &&
    wavHeader === "RIFF" &&
    format === "wav" &&
    capability === "ai.text.to.speech" &&
    foundation === FOUNDATION &&
    output?.voice_cloning_used === false &&
    output?.raw_reasoning_persisted === false &&
    (!contract || contract === "AVANTIQO_VOICE_ENGINE_V1");
  if (!passed) throw new Error("AVANTIQO_VOICE_TTS_FRESH_RESUME_INVALID_OUTPUT");
  return {
    audio,
    wav_header: wavHeader,
    audio_bytes: audio.length,
    format,
    capability,
    foundation_model: foundation,
    sample_rate: Number(output?.sample_rate) || null,
    generation_seconds: Number(output?.generation_seconds) || null,
  };
}

const credentials = requiredEither();
const report = {
  success: false,
  contract: CONTRACT,
  endpoint_id: ENDPOINT_ID,
  endpoint_name: ENDPOINT_NAME,
  job_id: JOB_ID,
  generation_submitted: false,
  duplicate_generation_submitted: false,
  queue_mutation_performed: false,
  job_cancelled: false,
  stt_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
  certified_image: CERTIFIED_IMAGE,
  foundation_model: FOUNDATION,
  workers_min_guard: null,
  final_status: null,
  audio_path: null,
  audio_bytes: null,
};

try {
  report.workers_min_guard = await ensureWorkersMinZero(credentials);
  const deadline = Date.now() + TIMEOUT_MS;
  let lastStatus = "UNKNOWN";
  let lastProgressAt = 0;
  let completedBody = null;

  while (Date.now() < deadline) {
    const body = await queueRead(`/status/${encodeURIComponent(JOB_ID)}`, credentials);
    const status = text(body?.status).toUpperCase() || "UNKNOWN";
    lastStatus = status;
    if (Date.now() - lastProgressAt >= 15_000 || status === "COMPLETED") {
      console.log(JSON.stringify({
        event: "AVANTIQO_VOICE_TTS_FRESH_RESUME_PROGRESS",
        endpoint_id: ENDPOINT_ID,
        job_id: JOB_ID,
        status,
        generation_submitted: false,
        duplicate_generation_submitted: false,
        secrets_printed: false,
      }));
      lastProgressAt = Date.now();
    }
    if (status === "COMPLETED") {
      completedBody = body;
      break;
    }
    if (["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) {
      const detail = text(body?.error || body?.message).slice(0, 400);
      throw new Error(`RUNPOD_JOB_${status}${detail ? `:${detail}` : ""}`);
    }
    await sleep(POLL_MS);
  }

  if (!completedBody) {
    throw new Error(`AVANTIQO_VOICE_TTS_FRESH_RESUME_TIMEOUT:${lastStatus}`);
  }

  const validated = validateCompletedOutput(completedBody);
  await mkdir(path.dirname(AUDIO_PATH), { recursive: true });
  await writeFile(AUDIO_PATH, validated.audio);

  report.success = true;
  report.final_status = "COMPLETED";
  report.audio_path = AUDIO_PATH;
  report.audio_bytes = validated.audio_bytes;
  report.tts = {
    wav_header: validated.wav_header,
    format: validated.format,
    capability: validated.capability,
    foundation_model: validated.foundation_model,
    sample_rate: validated.sample_rate,
    generation_seconds: validated.generation_seconds,
  };
} finally {
  try {
    report.workers_min_guard_final = await ensureWorkersMinZero(credentials);
  } catch (error) {
    report.workers_min_guard_final = {
      verified: false,
      error: text(error?.message || error),
    };
    process.exitCode = 1;
  }
  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify({
  success: report.success,
  contract: report.contract,
  endpoint_id: ENDPOINT_ID,
  job_id: JOB_ID,
  final_status: report.final_status,
  audio_path: report.audio_path,
  audio_bytes: report.audio_bytes,
  workers_min_guard: report.workers_min_guard_final,
  generation_submitted: false,
  duplicate_generation_submitted: false,
  stt_submitted: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`AVANTIQO_VOICE_TTS_FRESH_RESUME_REPORT=${REPORT_PATH}`);
if (report.success) {
  console.log(`AVANTIQO_VOICE_TTS_FRESH_RECOVERY_AUDIO=${AUDIO_PATH}`);
  if (process.platform === "darwin") {
    const playback = spawnSync("afplay", [AUDIO_PATH], { stdio: "inherit" });
    console.log(`AVANTIQO_VOICE_TTS_FRESH_RESUME_AFPLAY_STATUS=${playback.status ?? "UNKNOWN"}`);
  }
}
