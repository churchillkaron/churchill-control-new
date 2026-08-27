#!/usr/bin/env node

import { spawnSync } from "node:child_process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

function text(value) {
  return String(value ?? "").trim();
}

function approved(name) {
  if (text(process.env[name]).toUpperCase() !== "YES") {
    throw new Error(`${name}=YES_REQUIRED`);
  }
}

approved("AVANTIQO_AUDIO_BENCHMARK_SPEND_APPROVED");
approved("AVANTIQO_MUSIC_TRANSFORM_SOURCE_RIGHTS_APPROVED");

console.log("AVANTIQO_MUSIC_DYNAMIC_METAL_CONTINUITY_CERTIFICATION=START");
console.log("AVANTIQO_MUSIC_DYNAMIC_METAL_CONTINUITY_SOURCE=ORIGINAL_SYNTHETIC_COMPOSITION");
console.log("AVANTIQO_MUSIC_DYNAMIC_METAL_CONTINUITY_REFERENCE_RECORDING_USED=false");
console.log("AVANTIQO_MUSIC_DYNAMIC_METAL_CONTINUITY_ARTIST_IMITATION_REQUESTED=false");
console.log("AVANTIQO_MUSIC_DYNAMIC_METAL_CONTINUITY_CAPABILITY=ai.audio.extend");
console.log("AVANTIQO_MUSIC_DYNAMIC_METAL_CONTINUITY_SOURCE_MODE=MUSICAL_CONTINUITY");
console.log("AVANTIQO_MUSIC_DYNAMIC_METAL_CONTINUITY_FIXTURE_PROFILE=DYNAMIC_METAL");
console.log("AVANTIQO_MUSIC_DYNAMIC_METAL_CONTINUITY_MAX_PROVIDER_JOBS=1");
console.log("AVANTIQO_MUSIC_DYNAMIC_METAL_CONTINUITY_PRODUCTION_ACTIVATION=false");
console.log("AVANTIQO_MUSIC_DYNAMIC_METAL_CONTINUITY_PRICING_ACTIVATION=false");
console.log("AVANTIQO_MUSIC_DYNAMIC_METAL_CONTINUITY_PROVIDER_SELECTION_CHANGE=false");
console.log("AVANTIQO_MUSIC_DYNAMIC_METAL_CONTINUITY_HUMAN_REVIEW_REQUIRED=true");

const result = spawnSync(
  process.execPath,
  ["scripts/run-avantiqo-music-transform-certification-local.mjs"],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AVANTIQO_MUSIC_TRANSFORM_CAPABILITY: "ai.audio.extend",
      AVANTIQO_MUSIC_TRANSFORM_SOURCE_MODE: "MUSICAL_CONTINUITY",
      AVANTIQO_MUSIC_CONTINUITY_FIXTURE_PROFILE: "DYNAMIC_METAL",
    },
    stdio: "inherit",
  },
);

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`AVANTIQO_MUSIC_DYNAMIC_METAL_CONTINUITY_CERTIFICATION_FAILED:exit=${result.status ?? "UNKNOWN"}`);
}

console.log("AVANTIQO_MUSIC_DYNAMIC_METAL_CONTINUITY_CERTIFICATION=PASS");
console.log("AVANTIQO_MUSIC_DYNAMIC_METAL_CONTINUITY_HUMAN_REVIEW=PENDING");
