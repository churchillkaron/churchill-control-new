#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const PREFLIGHT = resolve("scripts/preflight-avantiqo-music-extend-runpod-local.mjs");
const SAFE_LEASE = resolve("scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs");
const BENCHMARK = resolve("scripts/benchmark-avantiqo-music-extend.mjs");
const PREFLIGHT_CONTRACT = "AVANTIQO_MUSIC_EXTEND_RUNPOD_PREFLIGHT_V1";

const text = (value) => String(value ?? "").trim();
const approved = (name) => { if (text(process.env[name]).toUpperCase() !== "YES") throw new Error(`${name}=YES_REQUIRED`); };

function preflight() {
  let raw = "";
  try {
    raw = execFileSync(process.execPath, [PREFLIGHT], {
      cwd: process.cwd(), env: process.env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 90_000,
    });
  } catch (error) {
    throw new Error(`AVANTIQO_MUSIC_EXTEND_CONTROLLED_PREFLIGHT_FAILED:${text(error?.stderr || error?.stdout || error?.message).slice(0, 1500)}`);
  }
  let result;
  try { result = JSON.parse(raw); } catch { throw new Error("AVANTIQO_MUSIC_EXTEND_CONTROLLED_PREFLIGHT_OUTPUT_INVALID"); }
  if (
    result?.success !== true ||
    result?.contract !== PREFLIGHT_CONTRACT ||
    result?.ready_for_safe_lease_certification !== true ||
    result?.endpoint?.workers_min !== 0 ||
    result?.endpoint?.workers_max !== 0 ||
    result?.endpoint?.quiet !== true ||
    result?.worker_image?.exact_digest_verified !== true ||
    result?.worker_image?.model_variant !== "acestep-v15-base" ||
    result?.worker_image?.task_type !== "complete" ||
    result?.worker_image?.ace_step_lm_required !== false ||
    result?.worker_image?.temporal_extension_proven !== false ||
    result?.safe_lease?.lane !== "music-extend" ||
    result?.safety?.read_only !== true ||
    result?.safety?.provider_job_submitted !== false ||
    result?.safety?.endpoint_mutation_performed !== false ||
    result?.safety?.volume_mutation_performed !== false
  ) throw new Error("AVANTIQO_MUSIC_EXTEND_CONTROLLED_PREFLIGHT_NOT_READY");
  return result;
}

const ready = preflight();
approved("AVANTIQO_MUSIC_EXTEND_BENCHMARK_SPEND_APPROVED");
approved("AVANTIQO_MUSIC_EXTEND_SOURCE_RIGHTS_APPROVED");

const endpointId = text(ready?.endpoint?.id);
if (!endpointId) throw new Error("AVANTIQO_MUSIC_EXTEND_CONTROLLED_ENDPOINT_ID_REQUIRED");

console.log("AVANTIQO_MUSIC_EXTEND_CONTROLLED_PREFLIGHT=PASS");
console.log(`AVANTIQO_MUSIC_EXTEND_CONTROLLED_ENDPOINT_ID=${endpointId}`);
console.log("AVANTIQO_MUSIC_EXTEND_CONTROLLED_SAFE_LEASE=AVANTIQO_RUNPOD_SAFE_LEASE_V2");
console.log("AVANTIQO_MUSIC_EXTEND_CONTROLLED_SAFE_LEASE_LANE=music-extend");
console.log("AVANTIQO_MUSIC_EXTEND_CONTROLLED_MAX_PROVIDER_JOBS=1");
console.log("AVANTIQO_MUSIC_EXTEND_CONTROLLED_HUMAN_REVIEW=PENDING");
console.log("AVANTIQO_MUSIC_EXTEND_CONTROLLED_PRODUCTION_ACTIVATION=false");
console.log("AVANTIQO_MUSIC_EXTEND_CONTROLLED_PRICING_ACTIVATION=false");

const child = spawnSync(
  process.execPath,
  [SAFE_LEASE, "--lane=music-extend", "--ttl-ms=1800000", "--", process.execPath, BENCHMARK],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RUNPOD_AVANTIQO_MUSIC_EXTEND_ENDPOINT_ID: endpointId,
      AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED: "YES",
      AVANTIQO_MUSIC_EXTEND_BENCHMARK_RUNS: "1",
    },
    stdio: "inherit",
  },
);
if (child.error) throw child.error;
if (child.status !== 0) throw new Error(`AVANTIQO_MUSIC_EXTEND_CONTROLLED_BENCHMARK_FAILED:exit=${child.status ?? "UNKNOWN"}`);
