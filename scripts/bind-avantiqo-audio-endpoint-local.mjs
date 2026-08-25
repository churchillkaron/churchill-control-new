import "./lib/avantiqo-audio-runpod-endpoint-ready-fetch-guard.mjs";
import fs from "node:fs";

const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
const AUDIO_CONTRACT = "AVANTIQO_AUDIO_ENGINE_V1";
const FINGERPRINT_CAPABILITY = "__avantiqo_endpoint_fingerprint__";
const POLL_INTERVAL_MS = 5000;
const MAX_WAIT_MS = Number(process.env.AVANTIQO_AUDIO_RUNPOD_FINGERPRINT_TIMEOUT_MS || 15 * 60 * 1000);

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestText(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(30000),
  });
  const raw = await response.text();
  let body = null;
  if (raw) {
    try { body = JSON.parse(raw); } catch { body = null; }
  }
  return { response, raw, body };
}

function compactDetail(value) {
  return text(value).replace(/\s+/g, " ").slice(0, 1200);
}

function writeAudioEndpointId(endpointId) {
  const envPath = ".env.local";
  if (!fs.existsSync(envPath)) throw new Error("ENV_LOCAL_REQUIRED");
  const line = `RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID=${endpointId}`;
  let env = fs.readFileSync(envPath, "utf8");
  if (/^(?:export\s+)?RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID=.*$/m.test(env)) {
    env = env.replace(/^(?:export\s+)?RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID=.*$/m, line);
  } else {
    env = `${env.trimEnd()}\n${line}\n`;
  }
  fs.writeFileSync(envPath, env, { encoding: "utf8", mode: 0o600 });
}

async function endpointHealth(endpointId, apiKey) {
  const { response, raw, body } = await requestText(
    `${RUNPOD_API_BASE}/${encodeURIComponent(endpointId)}/health`,
    { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } },
  );
  if (!response.ok) {
    throw new Error(`AVANTIQO_AUDIO_ENDPOINT_HEALTH_FAILED:${response.status}:${compactDetail(raw) || "EMPTY_BODY"}`);
  }
  return body || {};
}

async function submitFingerprint(endpointId, apiKey) {
  const { response, raw, body } = await requestText(
    `${RUNPOD_API_BASE}/${encodeURIComponent(endpointId)}/run`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: {
          contract: AUDIO_CONTRACT,
          capability: FINGERPRINT_CAPABILITY,
        },
      }),
    },
  );
  if (!response.ok || !body?.id) {
    throw new Error(`AVANTIQO_AUDIO_ENDPOINT_FINGERPRINT_SUBMIT_FAILED:${response.status}:${compactDetail(raw) || "EMPTY_BODY"}`);
  }
  return body.id;
}

async function cancelFingerprint(endpointId, jobId, apiKey) {
  const { response, raw, body } = await requestText(
    `${RUNPOD_API_BASE}/${encodeURIComponent(endpointId)}/cancel/${encodeURIComponent(jobId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    },
  );
  if (!response.ok) {
    throw new Error(
      `AVANTIQO_AUDIO_ENDPOINT_FINGERPRINT_CANCEL_FAILED:${response.status}:${compactDetail(raw) || "EMPTY_BODY"}`,
    );
  }
  console.log("FINGERPRINT_CLEANUP_CANCEL_REQUESTED=true");
  return body || {};
}

async function waitForFingerprint(endpointId, jobId, apiKey) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= MAX_WAIT_MS) {
    const { response, raw, body } = await requestText(
      `${RUNPOD_API_BASE}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(jobId)}`,
      { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } },
    );
    if (!response.ok) {
      throw new Error(`AVANTIQO_AUDIO_ENDPOINT_FINGERPRINT_STATUS_FAILED:${response.status}:${compactDetail(raw) || "EMPTY_BODY"}`);
    }
    const status = text(body?.status).toUpperCase();
    console.log(`FINGERPRINT_STATUS=${status || "UNKNOWN"}`);
    console.log(`FINGERPRINT_HEALTH=${JSON.stringify(await endpointHealth(endpointId, apiKey))}`);
    if (["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) return body || {};
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`AVANTIQO_AUDIO_ENDPOINT_FINGERPRINT_TIMEOUT:${MAX_WAIT_MS}`);
}

function fingerprintIdentity(result) {
  const serialized = JSON.stringify(result);
  if (serialized.includes("AVANTIQO_AUDIO_CAPABILITY_NOT_IMPLEMENTED")) return "AUDIO";
  if (serialized.includes("AVANTIQO_AUDIO_ENGINE_CONTRACT_INVALID")) return "AUDIO_LEGACY_OR_MISMATCH";
  if (serialized.includes("AVANTIQO_IMAGE_ENGINE_CONTRACT_INVALID")) return "IMAGE";
  if (serialized.includes("AVANTIQO_VIDEO_ENGINE_CONTRACT_INVALID")) return "CINEMA";
  return "UNKNOWN";
}

const candidateId = text(process.argv[2] || process.env.AVANTIQO_AUDIO_ENDPOINT_CANDIDATE_ID);
if (!candidateId) throw new Error("AVANTIQO_AUDIO_ENDPOINT_CANDIDATE_ID_REQUIRED");
if (!/^[A-Za-z0-9_-]+$/.test(candidateId)) throw new Error("AVANTIQO_AUDIO_ENDPOINT_CANDIDATE_ID_INVALID");

const apiKey = text(process.env.RUNPOD_AVANTIQO_AUDIO_API_KEY) || required("RUNPOD_API_KEY");
const knownOtherEndpointIds = [
  process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID,
  process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID,
  process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID,
  process.env.RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID,
  process.env.RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID,
  process.env.RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID,
  process.env.RUNPOD_AVANTIQO_LIPSYNC_ENDPOINT_ID,
].map(text).filter(Boolean);
if (knownOtherEndpointIds.includes(candidateId)) {
  throw new Error("AVANTIQO_AUDIO_ENDPOINT_CANDIDATE_COLLIDES_WITH_OTHER_ENGINE");
}

const health = await endpointHealth(candidateId, apiKey);
console.log(`CANDIDATE_ENDPOINT_ID=${candidateId}`);
console.log(`CANDIDATE_HEALTH=${JSON.stringify(health)}`);
console.log("FINGERPRINT_GENERATION_REQUESTED=false");
console.log("FINGERPRINT_MODEL_PIPELINE_REACHED=false");

const jobId = await submitFingerprint(candidateId, apiKey);
console.log(`FINGERPRINT_JOB_ID=${jobId}`);
let result = null;
try {
  result = await waitForFingerprint(candidateId, jobId, apiKey);
} catch (error) {
  try {
    await cancelFingerprint(candidateId, jobId, apiKey);
  } catch (cancelError) {
    console.error(`FINGERPRINT_CLEANUP_ERROR=${compactDetail(cancelError?.message || cancelError)}`);
  }
  throw error;
}
const identity = fingerprintIdentity(result);
console.log(`FINGERPRINT_IDENTITY=${identity}`);

if (identity !== "AUDIO") {
  console.log(`FINGERPRINT_RESULT=${JSON.stringify(result)}`);
  throw new Error(`AVANTIQO_AUDIO_ENDPOINT_IDENTITY_NOT_PROVEN:${identity}`);
}

writeAudioEndpointId(candidateId);
console.log("RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID_BOUND_LOCAL=true");
console.log("MODEL_GENERATION_PERFORMED=false");
console.log("SECRET_VALUES_PRINTED=false");
console.log("PRODUCTION_DEPLOY_PERFORMED=false");
