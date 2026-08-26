import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const SAFE_LEASE_SCRIPT = resolve("scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs");
const BENCHMARK_SCRIPT = resolve("scripts/benchmark-avantiqo-music-transform.mjs");
const SAFE_LEASE_LANE = "music-transform-candidate";

function text(value) { return String(value ?? "").trim(); }
function approved(name) { if (text(process.env[name]).toUpperCase() !== "YES") throw new Error(`${name}=YES_REQUIRED`); }
function required(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function capability() {
  const value = text(process.env.AVANTIQO_MUSIC_TRANSFORM_CAPABILITY);
  if (!["ai.audio.remix", "ai.audio.edit", "ai.audio.extend"].includes(value)) throw new Error("AVANTIQO_MUSIC_TRANSFORM_CAPABILITY_INVALID");
  return value;
}

const selectedCapability = capability();
approved("AVANTIQO_AUDIO_BENCHMARK_SPEND_APPROVED");
approved("AVANTIQO_MUSIC_TRANSFORM_SOURCE_RIGHTS_APPROVED");
required("RUNPOD_AVANTIQO_MUSIC_TRANSFORM_CANDIDATE_ENDPOINT_ID");

console.log("AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_CONTRACT=AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_JOB_V1");
console.log(`AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_CAPABILITY=${selectedCapability}`);
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

const child = spawnSync(
  process.execPath,
  [SAFE_LEASE_SCRIPT, `--lane=${SAFE_LEASE_LANE}`, "--ttl-ms=1800000", "--", process.execPath, BENCHMARK_SCRIPT],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED: "YES",
      AVANTIQO_MUSIC_TRANSFORM_CAPABILITY: selectedCapability,
    },
    stdio: "inherit",
  },
);

if (child.error) throw child.error;
if (child.status !== 0) throw new Error(`AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_FAILED:exit=${child.status ?? "UNKNOWN"}`);
