#!/usr/bin/env bash

set -euo pipefail

ROOT="${AVANTIQO_PROJECT_ROOT:-$(pwd)}"
cd "$ROOT"

fail() {
  echo "AVANTIQO_MUSIC_VOCAL_CORRECTION_LOCAL_PROVISION=FAIL"
  echo "AVANTIQO_MUSIC_VOCAL_CORRECTION_LOCAL_PROVISION_REASON=$1"
  echo "AVANTIQO_MUSIC_VOCAL_CORRECTION_LOCAL_PROVISION_SECRET_VALUES_PRINTED=false"
  exit 1
}

[ -f scripts/import-avantiqo-media-certification-vercel-env.sh ] || fail "VERCEL_ENV_IMPORT_SCRIPT_REQUIRED"
[ -f scripts/repair-avantiqo-runpod-env-local.sh ] || fail "RUNPOD_ENV_REPAIR_SCRIPT_REQUIRED"
[ -f scripts/provision-avantiqo-music-vocal-correction-runpod-local.mjs ] || fail "MUSIC_PROVISIONER_REQUIRED"
[ -f audits/results/avantiqo-music-vocal-correction-worker-image.json ] || fail "HARDENED_IMAGE_EVIDENCE_REQUIRED"

VERCEL_IMPORT_LOG="/tmp/avantiqo-music-vocal-correction-vercel-import.log"
if bash scripts/import-avantiqo-media-certification-vercel-env.sh >"$VERCEL_IMPORT_LOG" 2>&1; then
  grep '^AVANTIQO_' "$VERCEL_IMPORT_LOG" || true
  echo "AVANTIQO_MUSIC_VOCAL_CORRECTION_VERCEL_CREDENTIAL_IMPORT=PASS"
else
  grep '^AVANTIQO_' "$VERCEL_IMPORT_LOG" || true
  echo "AVANTIQO_MUSIC_VOCAL_CORRECTION_VERCEL_CREDENTIAL_IMPORT=FALLBACK_TO_LOCAL_REPAIR"
fi

RUNPOD_REPAIR_LOG="/tmp/avantiqo-music-vocal-correction-runpod-repair.log"
AVANTIQO_PROJECT_ROOT="$ROOT" bash scripts/repair-avantiqo-runpod-env-local.sh >"$RUNPOD_REPAIR_LOG" 2>&1 || {
  grep '^AVANTIQO_' "$RUNPOD_REPAIR_LOG" || true
  fail "RUNPOD_CREDENTIAL_REPAIR_FAILED"
}
grep '^AVANTIQO_' "$RUNPOD_REPAIR_LOG" || true

echo "AVANTIQO_MUSIC_VOCAL_CORRECTION_CREDENTIAL_PATH=VERCEL_THEN_CANONICAL_LOCAL_REPAIR"
echo "AVANTIQO_MUSIC_VOCAL_CORRECTION_CREDENTIAL_SECRET_VALUES_PRINTED=false"

mkdir -p local-audit-output
PLAN="local-audit-output/avantiqo-music-vocal-correction-provision-plan.json"
APPLY="local-audit-output/avantiqo-music-vocal-correction-provision-apply.json"

node --input-type=module - "$PLAN" "$APPLY" <<'NODE'
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";

const planPath = process.argv[2];
const applyPath = process.argv[3];
const envLocal = parseEnv(readFileSync(".env.local", "utf8"));
const key = String(envLocal.RUNPOD_MANAGEMENT_API_KEY || envLocal.RUNPOD_API_KEY || "").trim();
if (!key) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_RECOVERED_RUNPOD_CREDENTIAL_REQUIRED");

function runProvisioner(args, outputPath, apply = false) {
  const child = spawnSync(
    process.execPath,
    ["scripts/provision-avantiqo-music-vocal-correction-runpod-local.mjs", ...args],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      env: {
        ...process.env,
        RUNPOD_MANAGEMENT_API_KEY: key,
        ...(apply ? { AVANTIQO_MUSIC_VOCAL_CORRECTION_PROVISION_APPROVED: "YES" } : {}),
      },
    },
  );
  if (child.status !== 0) {
    const safeStderr = String(child.stderr || "")
      .split("\n")
      .filter((line) => !line.includes(key))
      .slice(-20)
      .join("\n");
    if (safeStderr) process.stderr.write(`${safeStderr}\n`);
    throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_PROVISIONER_EXIT_${child.status ?? "UNKNOWN"}`);
  }
  writeFileSync(outputPath, child.stdout, { mode: 0o600 });
}

runProvisioner([], planPath, false);
runProvisioner(["--apply"], applyPath, true);
NODE

node --input-type=module - "$APPLY" <<'NODE'
import { readFileSync } from "node:fs";
const path = process.argv[2];
const result = JSON.parse(readFileSync(path, "utf8"));
const endpoint = result.endpoint || {};
const failures = [];
const require = (name, ok) => { if (!ok) failures.push(name); };
require("success", result.success === true);
require("contract", result.contract === "AVANTIQO_MUSIC_VOCAL_CORRECTION_RUNPOD_PROVISION_V2");
require("endpoint_exists", result.endpoint_exists === true);
require("endpoint_name", endpoint.name === "avantiqo-music-vocal-correction-v1");
require("workers_min_zero", endpoint.workers_min === 0);
require("workers_max_zero", endpoint.workers_max === 0);
require("network_volume_empty", Array.isArray(endpoint.network_volume_ids) && endpoint.network_volume_ids.length === 0);
require("exact_image_digest", result.exact_image_digest_verified === true);
require("immutable_image", /^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(String(result.immutable_image || "")));
require("provider_job_false", result.provider_job_submitted === false);
require("production_false", result.production_deploy_performed === false);
if (result.workers_opened !== undefined) require("workers_opened_false", result.workers_opened === false);
if (failures.length) throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_LOCAL_PROVISION_VERIFY_FAILED:${failures.join(",")}`);
console.log("AVANTIQO_MUSIC_VOCAL_CORRECTION_LOCAL_PROVISION=PASS");
console.log(`AVANTIQO_MUSIC_VOCAL_CORRECTION_ENDPOINT_ID=${endpoint.id || ""}`);
console.log(`AVANTIQO_MUSIC_VOCAL_CORRECTION_TEMPLATE_ID=${endpoint.template_id || ""}`);
console.log("AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKERS=0/0");
console.log("AVANTIQO_MUSIC_VOCAL_CORRECTION_EXACT_IMAGE_DIGEST_VERIFIED=true");
console.log("AVANTIQO_MUSIC_VOCAL_CORRECTION_PROVIDER_JOB_SUBMITTED=false");
console.log("AVANTIQO_MUSIC_VOCAL_CORRECTION_PRODUCTION_ACTIVATION=false");
console.log("AVANTIQO_MUSIC_VOCAL_CORRECTION_NEXT=CERTIFY_ONLY_THROUGH_AVANTIQO_RUNPOD_SAFE_LEASE_V2");
console.log("AVANTIQO_MUSIC_VOCAL_CORRECTION_LOCAL_PROVISION_SECRET_VALUES_PRINTED=false");
NODE
