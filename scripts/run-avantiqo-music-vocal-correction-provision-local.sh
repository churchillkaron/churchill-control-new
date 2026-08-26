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

[ -f scripts/recover-avantiqo-runpod-env-from-local-sources.sh ] || fail "RUNPOD_RECOVERY_SCRIPT_REQUIRED"
[ -f scripts/provision-avantiqo-music-vocal-correction-runpod-local.mjs ] || fail "MUSIC_PROVISIONER_REQUIRED"
[ -f audits/results/avantiqo-music-vocal-correction-worker-image.json ] || fail "HARDENED_IMAGE_EVIDENCE_REQUIRED"

bash scripts/recover-avantiqo-runpod-env-from-local-sources.sh >/tmp/avantiqo-music-runpod-recovery.log || {
  cat /tmp/avantiqo-music-runpod-recovery.log | grep '^AVANTIQO_' || true
  fail "RUNPOD_CREDENTIAL_RECOVERY_FAILED"
}

grep '^AVANTIQO_' /tmp/avantiqo-music-runpod-recovery.log || true

eval "$(node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
const env = parseEnv(readFileSync(".env.local", "utf8"));
const key = String(env.RUNPOD_MANAGEMENT_API_KEY || env.RUNPOD_API_KEY || "").trim();
if (!key) process.exit(2);
const encoded = Buffer.from(key, "utf8").toString("base64");
console.log(`export AVANTIQO_MUSIC_RUNPOD_KEY_B64='${encoded}'`);
NODE
)" || fail "RECOVERED_RUNPOD_CREDENTIAL_REQUIRED"

if [ -z "${AVANTIQO_MUSIC_RUNPOD_KEY_B64:-}" ]; then
  fail "RECOVERED_RUNPOD_CREDENTIAL_REQUIRED"
fi
export RUNPOD_MANAGEMENT_API_KEY="$(printf '%s' "$AVANTIQO_MUSIC_RUNPOD_KEY_B64" | base64 --decode)"
unset AVANTIQO_MUSIC_RUNPOD_KEY_B64

mkdir -p local-audit-output
PLAN="local-audit-output/avantiqo-music-vocal-correction-provision-plan.json"
APPLY="local-audit-output/avantiqo-music-vocal-correction-provision-apply.json"

node scripts/provision-avantiqo-music-vocal-correction-runpod-local.mjs >"$PLAN"

AVANTIQO_MUSIC_VOCAL_CORRECTION_PROVISION_APPROVED=YES \
  node scripts/provision-avantiqo-music-vocal-correction-runpod-local.mjs --apply >"$APPLY"

node --input-type=module "$APPLY" <<'NODE'
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

unset RUNPOD_MANAGEMENT_API_KEY
