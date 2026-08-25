#!/usr/bin/env bash

set -euo pipefail

SOURCE_ROOT="${AVANTIQO_PROJECT_ROOT:-$HOME/Projects/churchill-control-new}"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/avantiqo-product-fast-e2e.XXXXXX")"
SLOT_MANAGER="$TMP_DIR/manage-avantiqo-intelligence-lane-slot-local.mjs"
FAST_SLOT_ACTIVE=NO
RESTORE_ATTEMPTED=NO

restore_deep_slot() {
  if [ "$FAST_SLOT_ACTIVE" != "YES" ] || [ "$RESTORE_ATTEMPTED" = "YES" ]; then
    return 0
  fi

  RESTORE_ATTEMPTED=YES
  echo ""
  echo "================ RESTORE DEEP INTELLIGENCE SLOT ================"
  set +e
  (
    cd "$SOURCE_ROOT" || exit 1
    AVANTIQO_INTELLIGENCE_FAST_SLOT_RESTORE_APPROVED=YES \
      node --env-file=.env.local "$SLOT_MANAGER" --restore-deep
  )
  local restore_status=$?
  set -e
  if [ "$restore_status" -eq 0 ]; then
    FAST_SLOT_ACTIVE=NO
    echo "AVANTIQO_INTELLIGENCE_DEEP_SLOT_RESTORE=PASS"
    return 0
  fi

  echo "AVANTIQO_INTELLIGENCE_DEEP_SLOT_RESTORE=FAIL"
  return "$restore_status"
}

cleanup() {
  local original_status=$?
  set +e
  restore_deep_slot
  local restore_status=$?
  rm -rf "$TMP_DIR" 2>/dev/null || true
  if [ "$original_status" -ne 0 ]; then
    exit "$original_status"
  fi
  if [ "$restore_status" -ne 0 ]; then
    exit "$restore_status"
  fi
  exit 0
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

git -C "$SOURCE_ROOT" show origin/main:scripts/manage-avantiqo-intelligence-lane-slot-local.mjs \
  > "$SLOT_MANAGER" || fail "INTELLIGENCE_SLOT_MANAGER_READ_FAILED"
node --check "$SLOT_MANAGER" || fail "INTELLIGENCE_SLOT_MANAGER_SYNTAX_FAILED"

echo ""
echo "================ INTELLIGENCE SLOT PLAN ================"
PLAN_OUTPUT="$(
  cd "$SOURCE_ROOT"
  node --env-file=.env.local "$SLOT_MANAGER"
)" || fail "INTELLIGENCE_SLOT_PLAN_FAILED"
printf '%s\n' "$PLAN_OUTPUT"
printf '%s\n' "$PLAN_OUTPUT" | grep -q '"deep_model": "Qwen/Qwen3-30B-A3B-Thinking-2507"' \
  || fail "DEEP_INTELLIGENCE_MODEL_NOT_VERIFIED"
printf '%s\n' "$PLAN_OUTPUT" | grep -q '"fast_model": "Qwen/Qwen3-30B-A3B-Instruct-2507"' \
  || fail "FAST_INTELLIGENCE_MODEL_NOT_VERIFIED"

echo ""
echo "================ PROVISION PARKED FAST LANE ================"
PROVISION_OUTPUT="$(
  cd "$SOURCE_ROOT"
  AVANTIQO_INTELLIGENCE_FAST_RUNPOD_PROVISION_APPROVED=YES \
    node --env-file=.env.local "$SLOT_MANAGER" --provision
)" || fail "FAST_LANE_PROVISION_FAILED"
printf '%s\n' "$PROVISION_OUTPUT"
printf '%s\n' "$PROVISION_OUTPUT" | grep -q '"parked_state": true' \
  || fail "FAST_LANE_PARKED_STATE_NOT_VERIFIED"
printf '%s\n' "$PROVISION_OUTPUT" | grep -q '"total_intelligence_workers_max": 1' \
  || fail "INTELLIGENCE_SLOT_TOTAL_NOT_PRESERVED_AFTER_PROVISION"

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
echo "================ ACTIVATE FAST INTELLIGENCE SLOT ================"
ACTIVATE_OUTPUT="$(
  cd "$SOURCE_ROOT"
  AVANTIQO_INTELLIGENCE_FAST_SLOT_SWAP_APPROVED=YES \
    node --env-file=.env.local "$SLOT_MANAGER" --activate-fast
)" || fail "FAST_LANE_SLOT_ACTIVATION_FAILED"
printf '%s\n' "$ACTIVATE_OUTPUT"
printf '%s\n' "$ACTIVATE_OUTPUT" | grep -q '"fast_active_state": true' \
  || fail "FAST_LANE_ACTIVE_STATE_NOT_VERIFIED"
printf '%s\n' "$ACTIVATE_OUTPUT" | grep -q '"total_intelligence_workers_max": 1' \
  || fail "INTELLIGENCE_SLOT_TOTAL_NOT_PRESERVED_AFTER_ACTIVATION"
FAST_SLOT_ACTIVE=YES

echo ""
echo "================ RUN PRODUCT E2E ================"
git -C "$SOURCE_ROOT" fetch origin main || fail "GIT_REFETCH_BEFORE_PRODUCT_E2E_FAILED"
set +e
git -C "$SOURCE_ROOT" show origin/main:scripts/run-operator-product-engineering-e2e-from-origin-main.sh \
  | bash
PIPE_STATUSES=("${PIPESTATUS[@]}")
set -e
E2E_STATUS="${PIPE_STATUSES[1]:-1}"

restore_deep_slot || fail "DEEP_INTELLIGENCE_SLOT_RESTORE_FAILED"

if [ "$E2E_STATUS" -ne 0 ]; then
  fail "PRODUCT_ENGINEERING_E2E_FAILED"
fi

echo ""
echo "AVANTIQO_PRODUCT_FAST_LANE_E2E=PASS"
echo "AVANTIQO_INTELLIGENCE_POST_E2E_STATE=DEEP_ACTIVE_FAST_PARKED"
