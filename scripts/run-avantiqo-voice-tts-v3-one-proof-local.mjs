import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parseEnv } from "node:util";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_VOICE_TTS_V3_ONE_PROOF_V2";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const READINESS_SCRIPT = resolve("scripts/check-avantiqo-voice-tts-v3-readiness-local.mjs");
const SMOKE_SCRIPT = resolve("scripts/smoke-avantiqo-voice-tts-cold-start-local.mjs");
const RUNPOD_ENV_REPAIR_SCRIPT = resolve("scripts/repair-avantiqo-runpod-env-local.sh");
const ENV_LOCAL_PATH = resolve(".env.local");
const AUDIO_PATH = resolve(
  process.env.AVANTIQO_VOICE_TTS_V3_ONE_PROOF_AUDIO_OUTPUT ||
  "/tmp/avantiqo-voice-tts-v3-one-proof.wav",
);
const REPORT_PATH = resolve(
  process.env.AVANTIQO_VOICE_TTS_V3_ONE_PROOF_REPORT_OUTPUT ||
  "/tmp/avantiqo-voice-tts-v3-one-proof.json",
);
const REQUIRED_MODEL = "resemble-ai/chatterbox:multilingual-v3";
const QUEUE = "https://api.runpod.ai/v2";
const RUNPOD_ENV_KEYS = Object.freeze([
  "RUNPOD_API_KEY",
  "RUNPOD_MANAGEMENT_API_KEY",
  "RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID",
]);

function text(value) { return String(value ?? "").trim(); }
function yes(value) { return ["YES", "TRUE", "1", "APPROVED"].includes(text(value).toUpperCase()); }
function required(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function keyKind(value) { return text(value).startsWith("rpa_") ? "SCOPED_RPA" : "LEGACY_OR_OTHER"; }

function runNode(script, env) {
  const result = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`AVANTIQO_VOICE_TTS_V3_ONE_PROOF_CHILD_FAILED:${script}:exit=${result.status}`);
  }
}

function runRunpodEnvRepair() {
  if (!existsSync(RUNPOD_ENV_REPAIR_SCRIPT)) {
    throw new Error("AVANTIQO_VOICE_TTS_V3_ONE_PROOF_RUNPOD_ENV_REPAIR_REQUIRED");
  }
  const result = spawnSync("bash", [RUNPOD_ENV_REPAIR_SCRIPT], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`AVANTIQO_VOICE_TTS_V3_ONE_PROOF_RUNPOD_ENV_REPAIR_FAILED:exit=${result.status}`);
  }
}

async function reloadRunpodEnvFromLocal() {
  if (!existsSync(ENV_LOCAL_PATH)) {
    throw new Error("AVANTIQO_VOICE_TTS_V3_ONE_PROOF_ENV_LOCAL_REQUIRED");
  }
  const parsed = parseEnv(await readFile(ENV_LOCAL_PATH, "utf8"));
  const safeLeaseEndpointId = yes(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE)
    ? text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID)
    : "";
  for (const key of RUNPOD_ENV_KEYS) {
    if (key === "RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID" && safeLeaseEndpointId) {
      process.env[key] = safeLeaseEndpointId;
      continue;
    }
    const value = text(parsed[key]);
    if (value) process.env[key] = value;
  }
  if (!text(process.env.RUNPOD_API_KEY)) {
    throw new Error("AVANTIQO_VOICE_TTS_V3_ONE_PROOF_RUNPOD_API_KEY_NOT_REPAIRED");
  }
  if (!text(process.env.RUNPOD_MANAGEMENT_API_KEY)) {
    throw new Error("AVANTIQO_VOICE_TTS_V3_ONE_PROOF_RUNPOD_MANAGEMENT_API_KEY_NOT_REPAIRED");
  }
  if (!text(process.env.RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID)) {
    throw new Error("AVANTIQO_VOICE_TTS_V3_ONE_PROOF_ENDPOINT_ID_NOT_REPAIRED");
  }
  console.log(JSON.stringify({
    event: "AVANTIQO_VOICE_TTS_V3_ONE_PROOF_LOCAL_RUNPOD_ENV_READY",
    runpod_api_key_configured: true,
    runpod_management_api_key_configured: true,
    voice_tts_endpoint_configured: true,
    safe_lease_endpoint_authoritative: Boolean(safeLeaseEndpointId),
    secret_values_printed: false,
  }));
}

function inferenceCandidates() {
  const primary = required("RUNPOD_API_KEY");
  const management = text(process.env.RUNPOD_MANAGEMENT_API_KEY);
  const candidates = [{ source: "RUNPOD_API_KEY", value: primary, key_kind: keyKind(primary) }];
  if (management && management !== primary) {
    candidates.push({ source: "RUNPOD_MANAGEMENT_API_KEY_READ_ONLY_FALLBACK", value: management, key_kind: keyKind(management) });
  }
  return candidates;
}

async function readHealth(endpointId, candidates) {
  const attempts = [];
  for (const candidate of candidates) {
    const response = await fetch(`${QUEUE}/${encodeURIComponent(endpointId)}/health`, {
      headers: { Authorization: `Bearer ${candidate.value}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    });
    const raw = await response.text();
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
    attempts.push({
      source: candidate.source,
      key_kind: candidate.key_kind,
      http_status: response.status,
      read_authorized: response.ok,
    });
    if (response.ok) return { body: body || {}, attempts, credential: candidate };
    if (![401, 403].includes(response.status)) {
      throw new Error(`RUNPOD_VOICE_TTS_V3_ONE_PROOF_HEALTH_HTTP_${response.status}`);
    }
  }
  throw new Error("AVANTIQO_VOICE_TTS_V3_ONE_PROOF_HEALTH_PERMISSION_REQUIRED");
}

function normalizeHealth(body = {}) {
  const jobs = body?.jobs && typeof body.jobs === "object" ? body.jobs : {};
  const workers = body?.workers && typeof body.workers === "object" ? body.workers : {};
  return {
    jobs: {
      in_queue: Number(jobs.inQueue ?? jobs.in_queue ?? 0) || 0,
      in_progress: Number(jobs.inProgress ?? jobs.in_progress ?? 0) || 0,
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

function requireSafeLeaseV2(endpointId) {
  if (!yes(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE)) {
    throw new Error("AVANTIQO_VOICE_TTS_V3_ONE_PROOF_SAFE_LEASE_ACTIVE_REQUIRED");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT) {
    throw new Error("AVANTIQO_VOICE_TTS_V3_ONE_PROOF_SAFE_LEASE_V2_REQUIRED");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== "voice-tts") {
    throw new Error("AVANTIQO_VOICE_TTS_V3_ONE_PROOF_SAFE_LEASE_LANE_MISMATCH");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID) !== endpointId) {
    throw new Error("AVANTIQO_VOICE_TTS_V3_ONE_PROOF_SAFE_LEASE_ENDPOINT_MISMATCH");
  }
  const expiresAt = Date.parse(text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT));
  if (!Number.isFinite(expiresAt) || expiresAt - Date.now() < 5000) {
    throw new Error("AVANTIQO_VOICE_TTS_V3_ONE_PROOF_SAFE_LEASE_EXPIRY_INVALID");
  }
}

if (!yes(process.env.AVANTIQO_VOICE_TTS_V3_ONE_PROOF_APPROVED)) {
  throw new Error("AVANTIQO_VOICE_TTS_V3_ONE_PROOF_APPROVED=YES_REQUIRED");
}

runRunpodEnvRepair();
await reloadRunpodEnvFromLocal();

const endpointId = required("RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID");
requireSafeLeaseV2(endpointId);
if (!existsSync(READINESS_SCRIPT)) throw new Error("AVANTIQO_VOICE_TTS_V3_ONE_PROOF_READINESS_SCRIPT_REQUIRED");
if (!existsSync(SMOKE_SCRIPT)) throw new Error("AVANTIQO_VOICE_TTS_V3_ONE_PROOF_SMOKE_SCRIPT_REQUIRED");

console.log(JSON.stringify({
  event: "AVANTIQO_VOICE_TTS_V3_ONE_PROOF_BEGIN",
  contract: CONTRACT,
  safe_lease_contract: SAFE_LEASE_CONTRACT,
  safe_lease_lane: "voice-tts",
  endpoint_id: endpointId,
  foundation_model: REQUIRED_MODEL,
  exactly_one_new_generation_max: true,
  local_runpod_env_repair_performed: true,
  stt_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
}));

runNode(READINESS_SCRIPT, process.env);

const healthRead = await readHealth(endpointId, inferenceCandidates());
const health = normalizeHealth(healthRead.body);
const jobBlockers = [];
if (health.jobs.in_queue !== 0) jobBlockers.push(`JOBS_IN_QUEUE:${health.jobs.in_queue}`);
if (health.jobs.in_progress !== 0) jobBlockers.push(`JOBS_IN_PROGRESS:${health.jobs.in_progress}`);
if (jobBlockers.length) {
  throw new Error(`AVANTIQO_VOICE_TTS_V3_ONE_PROOF_FINAL_JOB_HEALTH_BLOCKED:${jobBlockers.join(",")}`);
}

console.log(JSON.stringify({
  event: "AVANTIQO_VOICE_TTS_V3_ONE_PROOF_FINAL_JOB_HEALTH_CLEAR",
  health,
  worker_state_authority: "READINESS_THREE_PLANE_RECONCILIATION",
  health_read_attempts: healthRead.attempts,
  zero_ready_workers_allowed_for_serverless_cold_start: true,
  generation_submitted: false,
  secrets_printed: false,
}));

runNode(SMOKE_SCRIPT, {
  ...process.env,
  AVANTIQO_VOICE_TTS_FOUNDATION_MODEL: REQUIRED_MODEL,
  AVANTIQO_VOICE_TTS_COLD_START_TIMEOUT_MS: String(20 * 60_000),
  AVANTIQO_VOICE_TTS_COLD_START_AUDIO_OUTPUT: AUDIO_PATH,
  AVANTIQO_VOICE_TTS_COLD_START_REPORT_OUTPUT: REPORT_PATH,
});

if (!existsSync(AUDIO_PATH)) throw new Error("AVANTIQO_VOICE_TTS_V3_ONE_PROOF_AUDIO_REQUIRED");
const audioStat = await stat(AUDIO_PATH);
if (audioStat.size <= 1000) throw new Error(`AVANTIQO_VOICE_TTS_V3_ONE_PROOF_AUDIO_TOO_SMALL:${audioStat.size}`);

let audioPlayed = false;
if (process.platform === "darwin") {
  const played = spawnSync("afplay", [AUDIO_PATH], { stdio: "inherit", encoding: "utf8" });
  if (played.error || played.status !== 0) {
    throw played.error || new Error(`AVANTIQO_VOICE_TTS_V3_ONE_PROOF_AFPLAY_FAILED:exit=${played.status}`);
  }
  audioPlayed = true;
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  safe_lease_contract: SAFE_LEASE_CONTRACT,
  safe_lease_lane: "voice-tts",
  endpoint_id: endpointId,
  foundation_model: REQUIRED_MODEL,
  audio_path: AUDIO_PATH,
  audio_bytes: audioStat.size,
  audio_played: audioPlayed,
  exactly_one_new_generation_max: true,
  local_runpod_env_repair_performed: true,
  stt_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
}, null, 2));
