import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST_BASE = "https://rest.runpod.io/v1";
const PREFLIGHT_SCRIPT = resolve("scripts/preflight-avantiqo-music-transform-candidate-local.mjs");
const SAFE_LEASE_SCRIPT = resolve("scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs");
const BENCHMARK_SCRIPT = resolve("scripts/benchmark-avantiqo-music-transform.mjs");
const SAFE_LEASE_LANE = "music-transform-candidate";
const CANDIDATE_ENDPOINT_NAME = "avantiqo-music-transform-candidate-v1";
const PRODUCTION_AUDIO_ENDPOINT_NAME = "avantiqo-audio-v1";

function text(value) { return String(value ?? "").trim(); }
function approved(name) { if (text(process.env[name]).toUpperCase() !== "YES") throw new Error(`${name}=YES_REQUIRED`); }
function required(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function capability() {
  const value = text(process.env.AVANTIQO_MUSIC_TRANSFORM_CAPABILITY);
  if (!["ai.audio.remix", "ai.audio.edit", "ai.audio.extend"].includes(value)) throw new Error("AVANTIQO_MUSIC_TRANSFORM_CAPABILITY_INVALID");
  return value;
}
function endpointsFrom(body) {
  if (Array.isArray(body)) return body;
  for (const key of ["endpoints", "data", "items", "results"]) {
    if (Array.isArray(body?.[key])) return body[key];
  }
  return [];
}
async function resolveCandidateEndpointId(managementKey) {
  const response = await fetch(`${REST_BASE}/endpoints?includeTemplate=false&includeWorkers=false`, {
    headers: { Authorization: `Bearer ${managementKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 700);
    throw new Error(`AVANTIQO_MUSIC_TRANSFORM_ENDPOINT_RESOLUTION_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  const endpoints = endpointsFrom(body);
  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === CANDIDATE_ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  const endpointId = text(matches[0]?.id);
  if (!endpointId) throw new Error("AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_ENDPOINT_ID_MISSING");
  const productionCollision = endpoints.some(
    (endpoint) => text(endpoint?.name) === PRODUCTION_AUDIO_ENDPOINT_NAME && text(endpoint?.id) === endpointId,
  );
  if (productionCollision) throw new Error("AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_PRODUCTION_AUDIO_COLLISION");
  const configuredId = text(process.env.RUNPOD_AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_ENDPOINT_ID);
  if (configuredId && configuredId !== endpointId) {
    throw new Error("AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_CONFIGURED_ENDPOINT_ID_STALE");
  }
  return endpointId;
}

const selectedCapability = capability();
approved("AVANTIQO_AUDIO_BENCHMARK_SPEND_APPROVED");
approved("AVANTIQO_MUSIC_TRANSFORM_SOURCE_RIGHTS_APPROVED");
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const candidateEndpointId = await resolveCandidateEndpointId(managementKey);
const certificationEnv = {
  ...process.env,
  RUNPOD_AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_ENDPOINT_ID: candidateEndpointId,
};

console.log("AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_CONTRACT=AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_JOB_V1");
console.log(`AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_CAPABILITY=${selectedCapability}`);
console.log("AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_ENDPOINT_RESOLUTION=EXACT_NAME");
console.log(`AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_ENDPOINT_NAME=${CANDIDATE_ENDPOINT_NAME}`);
console.log("AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_PREFLIGHT=AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_PREFLIGHT_V1");
console.log("AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_PREFLIGHT_PROVIDER_JOB_SUBMITTED=false");
console.log("AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_PREFLIGHT_WORKERS_OPENED=false");
console.log("AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_SAFE_LEASE=AVANTIQO_RUNPOD_SAFE_LEASE_V2");
console.log(`AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_SAFE_LEASE_LANE=${SAFE_LEASE_LANE}`);
console.log("AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_ENDPOINT_SCOPE=MUSIC_TRANSFORM_CANDIDATE_ONLY");
console.log("AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_PRODUCTION_AUDIO_ENDPOINT_ALLOWED=false");
console.log("AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_MAX_PROVIDER_JOBS=1");
console.log("AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_SOURCE_RIGHTS_CONFIRMED=true");
console.log("AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_HUMAN_REVIEW_REQUIRED=true");
console.log("AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_AUTOMATIC_HUMAN_APPROVAL=false");
console.log("AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_PRODUCTION_ACTIVATION=false");
console.log("AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_PRICING_ACTIVATION=false");
console.log("AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_PROVIDER_SELECTION_CHANGE=false");
console.log("AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_SECRET_PRINTED=false");
if (selectedCapability === "ai.audio.extend") {
  console.log("AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_TEMPORAL_EXTEND_STRATEGY=XL_TURBO_REPAINT_RIGHT_OUTPAINT");
  console.log("AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_LONGER_OUTPUT_REQUIRED=true");
  console.log("AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_TEMPORAL_EXTENSION_PROVEN_BEFORE_RUN=false");
}

const preflight = spawnSync(process.execPath, [PREFLIGHT_SCRIPT], {
  cwd: process.cwd(),
  env: certificationEnv,
  stdio: "inherit",
});
if (preflight.error) throw preflight.error;
if (preflight.status !== 0) {
  throw new Error(`AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_PREFLIGHT_FAILED:exit=${preflight.status ?? "UNKNOWN"}`);
}

const child = spawnSync(
  process.execPath,
  [SAFE_LEASE_SCRIPT, `--lane=${SAFE_LEASE_LANE}`, "--ttl-ms=1800000", "--", process.execPath, BENCHMARK_SCRIPT],
  {
    cwd: process.cwd(),
    env: {
      ...certificationEnv,
      AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED: "YES",
      AVANTIQO_MUSIC_TRANSFORM_CAPABILITY: selectedCapability,
    },
    stdio: "inherit",
  },
);

if (child.error) throw child.error;
if (child.status !== 0) throw new Error(`AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_FAILED:exit=${child.status ?? "UNKNOWN"}`);
