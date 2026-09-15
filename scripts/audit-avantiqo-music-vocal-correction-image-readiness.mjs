#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { resolve } from "node:path";

const CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_IMAGE_READINESS_V2";
const evidencePath = resolve("audits/results/avantiqo-music-vocal-correction-worker-image.json");
const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
const sourceSha = String(evidence.source_sha || "").trim();
const paths = [
  "services/avantiqo-music-vocal-correction-engine/handler.py",
  "services/avantiqo-music-vocal-correction-engine/handler_v2.py",
  "services/avantiqo-music-vocal-correction-engine/timing.py",
  "services/avantiqo-music-vocal-correction-engine/key_parser.py",
  "services/avantiqo-music-vocal-correction-engine/requirements.txt",
  "services/avantiqo-music-vocal-correction-engine/Dockerfile",
];
function git(...args) { return execFileSync("git", args, { encoding: "utf8" }).trim(); }
const checks = [];
for (const path of paths) {
  let builtBlob = null;
  try { builtBlob = git("rev-parse", `${sourceSha}:${path}`); } catch {}
  const currentBlob = git("hash-object", path);
  checks.push({ path, built_blob: builtBlob, current_blob: currentBlob, match: Boolean(builtBlob && builtBlob === currentBlob) });
}
const sourceAvailable = /^[a-f0-9]{40}$/i.test(sourceSha);
const engineCurrent = sourceAvailable && checks.every((check) => check.match);
let planBound = false;
if (sourceAvailable) {
  try {
    const oldHandler = git("show", `${sourceSha}:services/avantiqo-music-vocal-correction-engine/handler_v2.py`);
    planBound = oldHandler.includes("approved_tuning_plan") && oldHandler.includes("approved_timing_plan") && oldHandler.includes("MUSICIAN_APPROVED_PLAN");
  } catch {}
}
const ready = evidence.success === true && evidence.production_certified === false && engineCurrent && planBound;
const report = {
  success: ready,
  contract: CONTRACT,
  image_source_sha: sourceSha || null,
  immutable_image_reference: evidence.immutable_image_reference || null,
  evidence_build_success: evidence.success === true,
  source_sha_available: sourceAvailable,
  exact_current_engine_sources: engineCurrent,
  musician_approved_plan_engine_in_image: planBound,
  source_checks: checks,
  certification_job_allowed: ready,
  provider_job_submitted: false,
  gpu_inference_performed: false,
  production_activation_performed: false,
  production_deploy_performed: false,
  blocker: ready ? null : "VOCAL_CORRECTION_IMMUTABLE_IMAGE_REBUILD_REQUIRED",
};
console.log(JSON.stringify(report, null, 2));
if (!ready) process.exitCode = 2;
