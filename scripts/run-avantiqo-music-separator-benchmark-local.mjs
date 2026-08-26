#!/usr/bin/env node

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const SAFE_LEASE_LANE = "music-separator";
const text = (value) => String(value ?? "").trim();

if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SAFE_LEASE_ACTIVE_REQUIRED");
}
if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT) {
  throw new Error("AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SAFE_LEASE_V2_REQUIRED");
}
if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== SAFE_LEASE_LANE) {
  throw new Error("AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SAFE_LEASE_LANE_REQUIRED");
}
if (!text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID)) {
  throw new Error("AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SAFE_LEASE_ENDPOINT_REQUIRED");
}

await import("./benchmark-avantiqo-music-separator-safe-lease-local.mjs");
