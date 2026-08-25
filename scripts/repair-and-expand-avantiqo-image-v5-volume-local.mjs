import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_IMAGE_V5_BIND_AND_VOLUME_EXPANSION_V2";
const BINDER = "scripts/rebind-avantiqo-image-v5-target-local.mjs";
const EXPANDER = "scripts/expand-avantiqo-image-video-volume-local.mjs";

function text(value) {
  return String(value ?? "").trim();
}

function approved(name) {
  return text(process.env[name]).toUpperCase() === "YES";
}

function run(label, script) {
  console.log(`AVANTIQO_IMAGE_V5_VOLUME_${label}=START`);
  const result = spawnSync(process.execPath, [script, "--apply"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) {
    throw new Error(`AVANTIQO_IMAGE_V5_VOLUME_${label}_SPAWN_FAILED:${text(result.error.message)}`);
  }
  if (result.status !== 0) {
    throw new Error(`AVANTIQO_IMAGE_V5_VOLUME_${label}_FAILED:exit=${result.status}`);
  }
  console.log(`AVANTIQO_IMAGE_V5_VOLUME_${label}=COMPLETE`);
}

if (!approved("AVANTIQO_IMAGE_V5_BIND_APPROVED")) {
  throw new Error("AVANTIQO_IMAGE_V5_BIND_APPROVED=YES_REQUIRED");
}
if (!approved("AVANTIQO_IMAGE_VIDEO_VOLUME_EXPANSION_APPROVED")) {
  throw new Error("AVANTIQO_IMAGE_VIDEO_VOLUME_EXPANSION_APPROVED=YES_REQUIRED");
}

console.log(`AVANTIQO_IMAGE_V5_VOLUME_CONTRACT=${CONTRACT}`);
console.log("AVANTIQO_IMAGE_V5_VOLUME_SEQUENCE=TARGET_SCOPED_V5_REBIND_THEN_IN_PLACE_VOLUME_EXPANSION");
console.log("AVANTIQO_IMAGE_V5_VOLUME_GLOBAL_SHARED_POLICY_BLOCKS_TARGET=false");
console.log("AVANTIQO_IMAGE_V5_VOLUME_GENERATION=false");
console.log("AVANTIQO_IMAGE_V5_VOLUME_INFERENCE=false");
console.log("AVANTIQO_IMAGE_V5_VOLUME_MODEL_DOWNLOAD=false");
console.log("AVANTIQO_IMAGE_V5_VOLUME_GPU_JOB=false");
console.log("AVANTIQO_IMAGE_V5_VOLUME_NEW_VOLUME=false");
console.log("AVANTIQO_IMAGE_V5_VOLUME_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_V5_VOLUME_FAIL_CLOSED_ON_MAIN_MOVE=true");
console.log("AVANTIQO_IMAGE_V5_VOLUME_FAIL_CLOSED_ON_CONCURRENT_ENDPOINT_CHANGE=true");

run("BIND", BINDER);
run("EXPAND", EXPANDER);

console.log("AVANTIQO_IMAGE_V5_VOLUME_COMPLETE=YES");
console.log("AVANTIQO_IMAGE_V5_VOLUME_NEXT_ACTION=VERIFY_QUOTA_CAPACITY_BEFORE_SINGLE_Z_IMAGE_CACHE_JOB");
