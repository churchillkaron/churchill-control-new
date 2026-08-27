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
const POLL_MS = 3000;
const TIMEOUT_MS = Math.max(60_000, Math.min(20 * 60_000, Number(process.env.AVANTIQO_VOICE_STT_EXISTING_AUDIO_TIMEOUT_MS || 15 * 60_000)));

function text(value) { return String(value ?? "").trim(); }
function yes(value) { return ["YES", "TRUE", "1", "APPROVED"].includes(text(value).toUpperCase()); }
function required(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function sleep(ms) { return new Promise((resolveSleep) => setTimeout(resolveSleep, ms)); }

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
  if (!response.ok) throw new Error(`RUNPOD_HTTP_${response.status}`);
  return body || {};
}

async function runProofInsideLease() {
  const endpointId = required("RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID");
  const apiKey = required("RUNPOD_API_KEY");
  if (!yes(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE)) throw new Error("AVANTIQO_VOICE_STT_EXISTING_AUDIO_SAFE_LEASE_REQUIRED");
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT) throw new Error("AVANTIQO_VOICE_STT_EXISTING_AUDIO_SAFE_LEASE_V2_REQUIRED");
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== "voice-stt") throw new Error("AVANTIQO_VOICE_STT_EXISTING_AUDIO_SAFE_LEASE_LANE_MISMATCH");
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID) !== endpointId) throw new Error("AVANTIQO_VOICE_STT_EXISTING_AUDIO_SAFE_LEASE_ENDPOINT_MISMATCH");
  if (!existsSync(AUDIO_PATH)) throw new Error(`AVANTIQO_VOICE_STT_EXISTING_AUDIO_REQUIRED:${AUDIO_PATH}`);

  const audio = await readFile(AUDIO_PATH);
  if (audio.length <= 1000) throw new Error(`AVANTIQO_VOICE_STT_EXISTING_AUDIO_TOO_SMALL:${audio.length}`);

  const health = await request(endpointId, "/health", apiKey);
  const inQueue = Number(health?.jobs?.inQueue ?? health?.jobs?.in_queue ?? 0) || 0;
  const inProgress = Number(health?.jobs?.inProgress ?? health?.jobs?.in_progress ?? 0) || 0;
  if (inQueue || inProgress) throw new Error(`AVANTIQO_VOICE_STT_EXISTING_AUDIO_JOB_BLOCKED:${inQueue}:${inProgress}`);

  const submission = await request(endpointId, "/run", apiKey, {
    method: "POST",
    body: {
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
    },
    timeoutMs: 15_000,
  });

  const jobId = text(submission.id);
  if (!jobId) throw new Error("AVANTIQO_VOICE_STT_EXISTING_AUDIO_JOB_ID_REQUIRED");

  const deadline = Date.now() + TIMEOUT_MS;
  let completed = null;
  while (Date.now() < deadline) {
    const status = await request(endpointId, `/status/${encodeURIComponent(jobId)}`, apiKey);
    const state = text(status.status).toUpperCase();
    if (state === "COMPLETED") {
      completed = status;
      break;
    }
    if (["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(state)) {
      throw new Error(`AVANTIQO_VOICE_STT_EXISTING_AUDIO_JOB_${state}`);
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
  const passed =
    transcript.length > 0 &&
    keywordMatched &&
    text(output.capability) === "ai.speech.to.text" &&
    text(output.foundation_model) === FOUNDATION_MODEL &&
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
