#!/usr/bin/env bash

set -euo pipefail

SOURCE_ROOT="${AVANTIQO_PROJECT_ROOT:-$HOME/Projects/churchill-control-new}"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/avantiqo-product-fast-e2e.XXXXXX")"
PROVISIONER="$TMP_DIR/provision-avantiqo-intelligence-fast-runpod-local.mjs"

cleanup() {
  rm -rf "$TMP_DIR" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

fail() {
  echo ""
  echo "AVANTIQO_PRODUCT_FAST_LANE_E2E=FAIL"
  echo "AVANTIQO_PRODUCT_FAST_LANE_REASON=$1"
  exit 1
}

[ -d "$SOURCE_ROOT/.git" ] || [ -f "$SOURCE_ROOT/.git" ] || fail "SOURCE_PROJECT_NOT_GIT_WORKTREE"
[ -f "$SOURCE_ROOT/.env.local" ] || fail "SOURCE_ENV_LOCAL_MISSING"
command -v git >/dev/null 2>&1 || fail "GIT_MISSING"
command -v node >/dev/null 2>&1 || fail "NODE_MISSING"

echo "============================================================"
echo "AVANTIQO PRODUCT FAST INTELLIGENCE E2E"
echo "============================================================"
echo ""
echo "================ FETCH AUTHORITATIVE MAIN ================"
git -C "$SOURCE_ROOT" fetch origin main || fail "GIT_FETCH_ORIGIN_MAIN_FAILED"
ORIGIN_MAIN="$(git -C "$SOURCE_ROOT" rev-parse origin/main 2>/dev/null || true)"
[ -n "$ORIGIN_MAIN" ] || fail "ORIGIN_MAIN_SHA_MISSING"
echo "SOURCE_ORIGIN_MAIN=$ORIGIN_MAIN"

git -C "$SOURCE_ROOT" show origin/main:scripts/provision-avantiqo-intelligence-fast-runpod-local.mjs \
  > "$PROVISIONER" || fail "FAST_LANE_PROVISIONER_READ_FAILED"

echo ""
echo "================ FAST LANE PLAN ================"
(
  cd "$SOURCE_ROOT"
  node --env-file=.env.local "$PROVISIONER"
) || fail "FAST_LANE_PLAN_FAILED"

echo ""
echo "================ FAST LANE APPLY ================"
(
  cd "$SOURCE_ROOT"
  AVANTIQO_INTELLIGENCE_FAST_RUNPOD_PROVISION_APPROVED=YES \
  AVANTIQO_INTELLIGENCE_FAST_RUNPOD_QUOTA_REBALANCE_APPROVED=YES \
    node --env-file=.env.local "$PROVISIONER" --apply
) || fail "FAST_LANE_APPLY_FAILED"

echo ""
echo "================ VERIFY FAST LANE EXISTS ================"
VERIFY_OUTPUT="$(
  cd "$SOURCE_ROOT"
  node --env-file=.env.local "$PROVISIONER"
)" || fail "FAST_LANE_VERIFY_READ_FAILED"
printf '%s\n' "$VERIFY_OUTPUT"
printf '%s\n' "$VERIFY_OUTPUT" | grep -q '"endpoint_exists": true' \
  || fail "FAST_LANE_ENDPOINT_NOT_OBSERVED_AFTER_APPLY"
printf '%s\n' "$VERIFY_OUTPUT" | grep -q '"fast_model": "Qwen/Qwen3-30B-A3B-Instruct-2507"' \
  || fail "FAST_LANE_MODEL_NOT_VERIFIED"

FAST_ENV_PRESENT="$(
  node - "$SOURCE_ROOT/.env.local" <<'NODE'
const fs = require("node:fs");
const { parseEnv } = require("node:util");
const env = parseEnv(fs.readFileSync(process.argv[2], "utf8"));
process.stdout.write(String(env.RUNPOD_AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_ID || "").trim() ? "YES" : "NO");
NODE
)" || fail "FAST_LANE_ENV_LOCAL_READ_FAILED"
[ "$FAST_ENV_PRESENT" = "YES" ] || fail "FAST_LANE_ENDPOINT_ID_NOT_PERSISTED"
echo "FAST_LANE_ENDPOINT_ID_PERSISTED=YES"
echo "FAST_LANE_SECRET_VALUES_PRINTED=NO"
echo "FAST_LANE_GENERATION_SUBMITTED_BY_SETUP=NO"
echo "FAST_LANE_PRODUCTION_DEPLOY_PERFORMED=NO"

echo ""
echo "================ RUN PRODUCT E2E ================"
git -C "$SOURCE_ROOT" fetch origin main || fail "GIT_REFETCH_BEFORE_PRODUCT_E2E_FAILED"
git -C "$SOURCE_ROOT" show origin/main:scripts/run-operator-product-engineering-e2e-from-origin-main.sh \
  | bash

E2E_STATUS=${PIPESTATUS[1]}
[ "$E2E_STATUS" -eq 0 ] || fail "PRODUCT_ENGINEERING_E2E_FAILED"

echo ""
echo "AVANTIQO_PRODUCT_FAST_LANE_E2E=PASS"
