#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const CONTRACT = "AVANTIQO_MUSIC_SEPARATOR_SAFE_LEASE_BENCHMARK_V1";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const LANE = "music-separator";

function text(value) {
  return String(value ?? "").trim();
}

function approved(name) {
  if (text(process.env[name]).toUpperCase() !== "YES") {
    throw new Error(`${name}=YES_REQUIRED`);
  }
}

approved("AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SPEND_APPROVED");
approved("AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_RIGHTS_APPROVED");

if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_MUSIC_SEPARATOR_SAFE_LEASE_ACTIVE_REQUIRED");
}
if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT) {
  throw new Error("AVANTIQO_MUSIC_SEPARATOR_SAFE_LEASE_V2_REQUIRED");
}
if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== LANE) {
  throw new Error("AVANTIQO_MUSIC_SEPARATOR_SAFE_LEASE_LANE_REQUIRED");
}
const endpointId = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID);
if (!endpointId) throw new Error("AVANTIQO_MUSIC_SEPARATOR_SAFE_LEASE_ENDPOINT_REQUIRED");
const expiresAt = Date.parse(text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT));
if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
  throw new Error("AVANTIQO_MUSIC_SEPARATOR_SAFE_LEASE_EXPIRED");
}

const result = spawnSync(
  process.execPath,
  [resolve("scripts/benchmark-avantiqo-music-separator.mjs")],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RUNPOD_AVANTIQO_MUSIC_SEPARATOR_ENDPOINT_ID: endpointId,
    },
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  },
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.status !== 0) {
  if (result.stderr) process.stderr.write(result.stderr);
  throw new Error(`AVANTIQO_MUSIC_SEPARATOR_SAFE_LEASE_BENCHMARK_CHILD_EXIT_${result.status ?? "UNKNOWN"}`);
}

console.log(`AVANTIQO_MUSIC_SEPARATOR_SAFE_LEASE_BENCHMARK_CONTRACT=${CONTRACT}`);
console.log(`AVANTIQO_MUSIC_SEPARATOR_SAFE_LEASE_CONTRACT=${SAFE_LEASE_CONTRACT}`);
console.log(`AVANTIQO_MUSIC_SEPARATOR_SAFE_LEASE_LANE=${LANE}`);
console.log("AVANTIQO_MUSIC_SEPARATOR_SAFE_LEASE_JOB_LIMIT=1");
console.log("AVANTIQO_MUSIC_SEPARATOR_SAFE_LEASE_SECRET_VALUES_PRINTED=false");
