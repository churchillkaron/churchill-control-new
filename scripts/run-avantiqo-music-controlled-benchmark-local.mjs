import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

const REQUIRED_NODE_MAJOR = 24;
const SELF_PATH = fileURLToPath(import.meta.url);

function text(value) {
  return String(value ?? "").trim();
}

function nodeMajor(version) {
  const match = text(version).replace(/^v/i, "").match(/^(\d+)/);
  return match ? Number(match[1]) : 0;
}

function probeNode(executable) {
  const candidate = text(executable);
  if (!candidate) return null;
  const result = spawnSync(candidate, ["--version"], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.error || result.status !== 0) return null;
  const version = text(result.stdout);
  return nodeMajor(version) >= REQUIRED_NODE_MAJOR ? { executable: candidate, version } : null;
}

function resolveNode24() {
  const candidates = [];
  const explicit = text(process.env.AVANTIQO_NODE24_BIN);
  if (explicit) candidates.push(explicit);

  const nvm = spawnSync(
    "/bin/zsh",
    ["-lc", 'source "${NVM_DIR:-$HOME/.nvm}/nvm.sh" >/dev/null 2>&1 && nvm which 24'],
    {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  if (!nvm.error && nvm.status === 0 && text(nvm.stdout)) candidates.push(text(nvm.stdout));

  candidates.push(
    "/opt/homebrew/opt/node@24/bin/node",
    "/usr/local/opt/node@24/bin/node",
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
    "node24",
  );

  for (const candidate of [...new Set(candidates)]) {
    const resolved = probeNode(candidate);
    if (resolved) return resolved;
  }
  return null;
}

const currentNodeMajor = nodeMajor(process.versions.node);
if (currentNodeMajor < REQUIRED_NODE_MAJOR) {
  if (process.env.AVANTIQO_MUSIC_NODE24_REEXEC === "1") {
    throw new Error(
      `AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_NODE24_REEXEC_FAILED:current=${process.version}:required=24`,
    );
  }
  const node24 = resolveNode24();
  if (!node24) {
    throw new Error(
      `AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_NODE24_REQUIRED:current=${process.version}:repo_nvmrc=24:next_action=nvm_use_24`,
    );
  }
  console.log(`AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_NODE_REEXEC=${process.version}->${node24.version}`);
  const reexec = spawnSync(node24.executable, [SELF_PATH, ...process.argv.slice(2)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AVANTIQO_MUSIC_NODE24_REEXEC: "1",
    },
    stdio: "inherit",
  });
  if (reexec.error) throw reexec.error;
  process.exit(Number.isInteger(reexec.status) ? reexec.status : 1);
}

loadAvantiqoEnv();

const PREFLIGHT_SCRIPT = resolve("scripts/preflight-avantiqo-music-local.mjs");
const CAPACITY_SCRIPT = resolve("scripts/assert-avantiqo-music-xl-lm-storage-capacity-local.mjs");
const SCHEDULABILITY_SCRIPT = resolve("scripts/assert-avantiqo-music-runpod-schedulability-local.mjs");
const BENCHMARK_SCRIPT = resolve("scripts/benchmark-avantiqo-music.mjs");
const PREFLIGHT_CONTRACT = "AVANTIQO_MUSIC_LOCAL_PREFLIGHT_V3";
const CAPACITY_CONTRACT = "AVANTIQO_MUSIC_XL_LM_STORAGE_CAPACITY_V1";
const SCHEDULABILITY_CONTRACT = "AVANTIQO_MUSIC_RUNPOD_SCHEDULABILITY_V1";
const MINIMUM_CAPACITY_GB = 80;

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

function runVerifiedSchedulabilityGate() {
  const result = runJsonGate(
    SCHEDULABILITY_SCRIPT,
    "AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_SCHEDULABILITY_FAILED",
  );
  if (
    result?.success !== true ||
    result?.contract !== SCHEDULABILITY_CONTRACT ||
    result?.capacity_sufficient !== true ||
    result?.resilience_ready !== true ||
    result?.ready_for_controlled_benchmark !== true ||
    !Array.isArray(result?.current_region?.endpoint_schedulable_gpu_types) ||
    result.current_region.endpoint_schedulable_gpu_types.length < 1 ||
    result?.safety?.read_only !== true ||
    result?.safety?.endpoint_mutation_performed !== false ||
    result?.safety?.network_volume_mutation_performed !== false ||
    result?.safety?.generation_submitted !== false ||
    result?.safety?.production_deploy_performed !== false
  ) {
    const repair = result?.repair || {};
    const action = repair.in_place_gpu_pool_expansion_possible
      ? `IN_PLACE_GPU_POOL_EXPANSION:${(repair.recommended_in_place_gpu_pool || repair.in_place_gpu_types_to_add || []).join("|") || "UNKNOWN"}`
      : repair.shared_cache_region_migration_required
        ? `SHARED_CACHE_REGION_MIGRATION:${repair.recommended_migration_target?.data_center_id || "UNKNOWN"}`
        : "RUNPOD_CAPACITY_REPAIR_REQUIRED";
    throw new Error(`AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_NOT_SCHEDULABLE:${action}`);
  }
  return result;
}

const preflight = runVerifiedPreflight();
const capacity = runVerifiedCapacityGate();
const schedulability = runVerifiedSchedulabilityGate();
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

console.log(`AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_NODE=${process.version}`);
console.log("AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_PREFLIGHT=PASS");
console.log(`AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_CREDENTIAL_SOURCE=${credentialSource}`);
console.log("AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_CREDENTIAL_REUSED=true");
console.log(`AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_CACHE_GB=${capacity.actual_size_gb}`);
console.log(`AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_MIN_CACHE_GB=${MINIMUM_CAPACITY_GB}`);
console.log("AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_CACHE_CAPACITY=PASS");
console.log(`AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_CACHE_DATACENTER=${schedulability.shared_cache.data_center_id}`);
console.log(`AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_SCHEDULABLE_GPU_TYPES=${schedulability.current_region.endpoint_schedulable_gpu_types.join("|")}`);
console.log("AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_SCHEDULABILITY=PASS");
console.log("AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_RESILIENCE=PASS");
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
