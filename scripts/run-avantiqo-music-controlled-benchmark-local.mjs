import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const PREFLIGHT_SCRIPT = resolve("scripts/preflight-avantiqo-music-local.mjs");
const CAPACITY_SCRIPT = resolve("scripts/assert-avantiqo-music-xl-lm-storage-capacity-local.mjs");
const BENCHMARK_SCRIPT = resolve("scripts/benchmark-avantiqo-music.mjs");
const PREFLIGHT_CONTRACT = "AVANTIQO_MUSIC_LOCAL_PREFLIGHT_V3";
const CAPACITY_CONTRACT = "AVANTIQO_MUSIC_XL_LM_STORAGE_CAPACITY_V1";
const MINIMUM_CAPACITY_GB = 80;

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function runJsonGate(script, failureCode, timeout = 60_000) {
  let raw = "";
  try {
    raw = execFileSync(process.execPath, [script], {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout,
    });
  } catch (error) {
    const detail = text(error?.stderr || error?.stdout || error?.message).slice(0, 1600);
    throw new Error(`${failureCode}:${detail || "UNKNOWN"}`);
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${failureCode}_OUTPUT_INVALID`);
  }
}

function runVerifiedPreflight() {
  const result = runJsonGate(
    PREFLIGHT_SCRIPT,
    "AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_PREFLIGHT_FAILED",
  );

  if (
    result?.success !== true ||
    result?.contract !== PREFLIGHT_CONTRACT ||
    result?.ready_for_controlled_benchmark !== true ||
    result?.endpoint?.health_reachable !== true ||
    result?.worker_image?.registry_backed_template_verified !== true ||
    result?.worker_image?.source_locked_ghcr_tag_verified !== true ||
    result?.safety?.worker_image_binding_verified !== true ||
    result?.safety?.registry_backed_endpoint_verified !== true
  ) {
    throw new Error("AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_PREFLIGHT_NOT_READY");
  }

  return result;
}

function runVerifiedCapacityGate() {
  const result = runJsonGate(
    CAPACITY_SCRIPT,
    "AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_CAPACITY_FAILED",
  );
  if (
    result?.success !== true ||
    result?.contract !== CAPACITY_CONTRACT ||
    result?.capacity_sufficient !== true ||
    Number(result?.actual_size_gb || 0) < MINIMUM_CAPACITY_GB ||
    Number(result?.minimum_required_size_gb || 0) !== MINIMUM_CAPACITY_GB ||
    result?.generation_submitted !== false ||
    result?.endpoint_mutation_performed !== false ||
    result?.production_deploy_performed !== false
  ) {
    throw new Error("AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_CAPACITY_NOT_READY");
  }
  return result;
}

const preflight = runVerifiedPreflight();
const capacity = runVerifiedCapacityGate();
const credentialSource = text(preflight?.endpoint?.health_credential_source);
let credentialName = "";
if (credentialSource === "AUDIO_DEDICATED") {
  credentialName = "RUNPOD_AVANTIQO_AUDIO_API_KEY";
} else if (credentialSource === "ACCOUNT") {
  credentialName = "RUNPOD_API_KEY";
} else {
  throw new Error(`AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_CREDENTIAL_SOURCE_INVALID:${credentialSource || "MISSING"}`);
}
const verifiedCredential = required(credentialName);

console.log("AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_PREFLIGHT=PASS");
console.log(`AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_CREDENTIAL_SOURCE=${credentialSource}`);
console.log("AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_CREDENTIAL_REUSED=true");
console.log(`AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_CACHE_GB=${capacity.actual_size_gb}`);
console.log(`AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_MIN_CACHE_GB=${MINIMUM_CAPACITY_GB}`);
console.log("AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_CACHE_CAPACITY=PASS");
console.log("AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_SECRET_PRINTED=false");
console.log("AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_PRODUCTION_DEPLOY_PERFORMED=false");
console.log("AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_PRICING_ACTIVATION_PERFORMED=false");

const child = spawnSync(process.execPath, [BENCHMARK_SCRIPT], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    RUNPOD_API_KEY: verifiedCredential,
  },
  stdio: "inherit",
});

if (child.error) throw child.error;
if (child.status !== 0) {
  throw new Error(`AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_FAILED:exit=${child.status ?? "UNKNOWN"}`);
}
