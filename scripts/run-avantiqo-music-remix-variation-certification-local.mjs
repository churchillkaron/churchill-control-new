#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST_BASE = "https://rest.runpod.io/v1";
const PREFLIGHT_SCRIPT = resolve("scripts/preflight-avantiqo-music-transform-candidate-local.mjs");
const SAFE_LEASE_SCRIPT = resolve("scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs");
const BENCHMARK_SCRIPT = resolve("scripts/benchmark-avantiqo-music-remix-variation.mjs");
const SAFE_LEASE_LANE = "music-transform-candidate";
const CANDIDATE_ENDPOINT_NAME = "avantiqo-music-transform-candidate-v1";
const PRODUCTION_AUDIO_ENDPOINT_NAME = "avantiqo-audio-v1";

function text(value) { return String(value ?? "").trim(); }
function approved(name) { if (text(process.env[name]).toUpperCase() !== "YES") throw new Error(`${name}=YES_REQUIRED`); }
function required(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
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
    throw new Error(`AVANTIQO_MUSIC_REMIX_VARIATION_ENDPOINT_RESOLUTION_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 700)}`);
  }
  const endpoints = endpointsFrom(body);
  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === CANDIDATE_ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_MUSIC_REMIX_VARIATION_CANDIDATE_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  const endpointId = text(matches[0]?.id);
  if (!endpointId) throw new Error("AVANTIQO_MUSIC_REMIX_VARIATION_CANDIDATE_ENDPOINT_ID_MISSING");
  if (endpoints.some((endpoint) => text(endpoint?.name) === PRODUCTION_AUDIO_ENDPOINT_NAME && text(endpoint?.id) === endpointId)) {
    throw new Error("AVANTIQO_MUSIC_REMIX_VARIATION_CANDIDATE_PRODUCTION_AUDIO_COLLISION");
  }
  return endpointId;
}

approved("AVANTIQO_AUDIO_BENCHMARK_SPEND_APPROVED");
approved("AVANTIQO_MUSIC_TRANSFORM_SOURCE_RIGHTS_APPROVED");
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const candidateEndpointId = await resolveCandidateEndpointId(managementKey);
const certificationEnv = {
  ...process.env,
  RUNPOD_AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_ENDPOINT_ID: candidateEndpointId,
  AVANTIQO_MUSIC_TRANSFORM_CAPABILITY: "ai.audio.remix",
  AVANTIQO_MUSIC_TRANSFORM_SOURCE_MODE: "TECHNICAL_SYNTHETIC",
  AVANTIQO_MUSIC_CONTINUITY_FIXTURE_PROFILE: "DYNAMIC_METAL",
};

console.log("AVANTIQO_MUSIC_REMIX_VARIATION_CERTIFICATION=START");
console.log("AVANTIQO_MUSIC_REMIX_VARIATION_CAPABILITY=ai.audio.remix");
console.log("AVANTIQO_MUSIC_REMIX_VARIATION_SOURCE=ORIGINAL_DYNAMIC_METAL_FIXTURE");
console.log("AVANTIQO_MUSIC_REMIX_VARIATION_EXTERNAL_REFERENCE_RECORDING_USED=false");
console.log("AVANTIQO_MUSIC_REMIX_VARIATION_ARTIST_IMITATION_REQUESTED=false");
console.log("AVANTIQO_MUSIC_REMIX_VARIATION_ENDPOINT_SCOPE=MUSIC_TRANSFORM_CANDIDATE_ONLY");
console.log("AVANTIQO_MUSIC_REMIX_VARIATION_MAX_PROVIDER_JOBS=1");
console.log("AVANTIQO_MUSIC_REMIX_VARIATION_HUMAN_REVIEW_REQUIRED=true");
console.log("AVANTIQO_MUSIC_REMIX_VARIATION_PRODUCTION_ACTIVATION=false");
console.log("AVANTIQO_MUSIC_REMIX_VARIATION_PRICING_ACTIVATION=false");
console.log("AVANTIQO_MUSIC_REMIX_VARIATION_PROVIDER_SELECTION_CHANGE=false");

const preflight = spawnSync(process.execPath, [PREFLIGHT_SCRIPT], {
  cwd: process.cwd(),
  env: certificationEnv,
  stdio: "inherit",
});
if (preflight.error) throw preflight.error;
if (preflight.status !== 0) {
  throw new Error(`AVANTIQO_MUSIC_REMIX_VARIATION_PREFLIGHT_FAILED:exit=${preflight.status ?? "UNKNOWN"}`);
}

const result = spawnSync(
  process.execPath,
  [SAFE_LEASE_SCRIPT, `--lane=${SAFE_LEASE_LANE}`, "--ttl-ms=1800000", "--", process.execPath, BENCHMARK_SCRIPT],
  {
    cwd: process.cwd(),
    env: {
      ...certificationEnv,
      AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED: "YES",
    },
    stdio: "inherit",
  },
);
if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`AVANTIQO_MUSIC_REMIX_VARIATION_CERTIFICATION_FAILED:exit=${result.status ?? "UNKNOWN"}`);
}

console.log("AVANTIQO_MUSIC_REMIX_VARIATION_CERTIFICATION=PASS");
console.log("AVANTIQO_MUSIC_REMIX_VARIATION_HUMAN_REVIEW=PENDING");
