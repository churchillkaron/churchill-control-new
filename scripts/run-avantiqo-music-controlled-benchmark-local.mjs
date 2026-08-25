import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";

const PREFLIGHT_SCRIPT = resolve("scripts/preflight-avantiqo-music-local.mjs");
const BENCHMARK_SCRIPT = resolve("scripts/benchmark-avantiqo-music.mjs");
const PREFLIGHT_CONTRACT = "AVANTIQO_MUSIC_LOCAL_PREFLIGHT_V3";

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function runVerifiedPreflight() {
  let raw = "";
  try {
    raw = execFileSync(process.execPath, [PREFLIGHT_SCRIPT], {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
    });
  } catch (error) {
    const detail = text(error?.stderr || error?.stdout || error?.message).slice(0, 1600);
    throw new Error(`AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_PREFLIGHT_FAILED:${detail || "UNKNOWN"}`);
  }

  let result = null;
  try {
    result = JSON.parse(raw);
  } catch {
    throw new Error("AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_PREFLIGHT_OUTPUT_INVALID");
  }

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

const preflight = runVerifiedPreflight();
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
