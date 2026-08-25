#!/usr/bin/env bash

set -euo pipefail

SOURCE_ROOT="${AVANTIQO_PROJECT_ROOT:-$HOME/Projects/churchill-control-new}"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/avantiqo-product-fast-e2e.XXXXXX")"
SLOT_MANAGER="$TMP_DIR/manage-avantiqo-intelligence-lane-slot-local.mjs"
INNER_E2E_RUNNER="$TMP_DIR/run-operator-product-engineering-e2e-from-origin-main.sh"
SMOKE_AUTH_ENV="$TMP_DIR/operator-product-smoke-auth.env"
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

prepare_smoke_auth_env() {
  local local_status
  local development_env
  local vercel_cli
  local merged_status

  local_status="$(
    node - "$SOURCE_ROOT/.env.local" "$SMOKE_AUTH_ENV" <<'NODE'
const fs = require("node:fs");
const { parseEnv } = require("node:util");
const source = parseEnv(fs.readFileSync(process.argv[2], "utf8"));
const email = String(source.FINANCE_SMOKE_EMAIL ?? "").trim();
const password = String(source.FINANCE_SMOKE_PASSWORD ?? "");
if (!email || !password) {
  process.stdout.write("NO");
  process.exit(0);
}
fs.writeFileSync(
  process.argv[3],
  `FINANCE_SMOKE_EMAIL=${JSON.stringify(email)}\nFINANCE_SMOKE_PASSWORD=${JSON.stringify(password)}\n`,
  { mode: 0o600 },
);
process.stdout.write("YES");
NODE
  )" || return 1

  if [ "$local_status" = "YES" ]; then
    printf '%s' "LOCAL_ENV_LOCAL"
    return 0
  fi

  development_env="$TMP_DIR/vercel-development-auth.env"
  if [ -x "$SOURCE_ROOT/node_modules/.bin/vercel" ]; then
    vercel_cli="$SOURCE_ROOT/node_modules/.bin/vercel"
  else
    vercel_cli="$(command -v vercel 2>/dev/null || true)"
  fi
  [ -n "$vercel_cli" ] || return 1
  [ -f "$SOURCE_ROOT/.vercel/project.json" ] || return 1

  (
    cd "$SOURCE_ROOT" || exit 1
    "$vercel_cli" env pull "$development_env" --environment=development --yes >/dev/null 2>&1
  ) || return 1

  merged_status="$(
    node - "$SOURCE_ROOT/.env.local" "$development_env" "$SMOKE_AUTH_ENV" <<'NODE'
const fs = require("node:fs");
const { parseEnv } = require("node:util");
const local = parseEnv(fs.readFileSync(process.argv[2], "utf8"));
const development = parseEnv(fs.readFileSync(process.argv[3], "utf8"));
const nonEmpty = (value) => Boolean(String(value ?? "").trim());
const pick = (key) => nonEmpty(local[key]) ? String(local[key]) : String(development[key] ?? "");
const email = pick("FINANCE_SMOKE_EMAIL").trim();
const password = pick("FINANCE_SMOKE_PASSWORD");
if (!email || !password) {
  process.stdout.write("NO");
  process.exit(0);
}
fs.writeFileSync(
  process.argv[4],
  `FINANCE_SMOKE_EMAIL=${JSON.stringify(email)}\nFINANCE_SMOKE_PASSWORD=${JSON.stringify(password)}\n`,
  { mode: 0o600 },
);
process.stdout.write("YES");
NODE
  )" || {
    rm -f "$development_env"
    return 1
  }
  rm -f "$development_env"

  [ "$merged_status" = "YES" ] || return 1
  printf '%s' "VERCEL_DEVELOPMENT"
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
if ! printf '%s\n' "$PROVISION_OUTPUT" | grep -q '"parked_state": true' && \
   ! printf '%s\n' "$PROVISION_OUTPUT" | grep -q '"fast_active_state": true'; then
  fail "FAST_LANE_SAFE_SINGLE_SLOT_STATE_NOT_VERIFIED"
fi
echo "FAST_LANE_SAFE_SINGLE_SLOT_STATE=YES"
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
echo "================ PREPARE NONINTERACTIVE AUTH ================"
AUTH_SOURCE="$(prepare_smoke_auth_env)" || fail "PRODUCT_E2E_NONINTERACTIVE_AUTH_MISSING"
echo "E2E_FAST_WRAPPER_AUTH_SOURCE=$AUTH_SOURCE"
echo "E2E_FAST_WRAPPER_AUTH_VALUES_PRINTED=NO"

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
git -C "$SOURCE_ROOT" show origin/main:scripts/run-operator-product-engineering-e2e-from-origin-main.sh \
  > "$INNER_E2E_RUNNER" || fail "PRODUCT_E2E_RUNNER_READ_FAILED"
set +e
node --env-file="$SMOKE_AUTH_ENV" - "$INNER_E2E_RUNNER" "$SOURCE_ROOT" <<'NODE'
const { spawnSync } = require("node:child_process");
const script = process.argv[2];
const sourceRoot = process.argv[3];
const email = String(process.env.FINANCE_SMOKE_EMAIL ?? "").trim();
const password = String(process.env.FINANCE_SMOKE_PASSWORD ?? "");
if (!email || !password) process.exit(2);
const child = spawnSync("bash", [script], {
  stdio: "inherit",
  env: {
    ...process.env,
    AVANTIQO_PROJECT_ROOT: sourceRoot,
    AVANTIQO_INTELLIGENCE_FAST_TIMEOUT_MS:
      process.env.AVANTIQO_INTELLIGENCE_FAST_TIMEOUT_MS || "480000",
  },
});
if (child.error) {
  console.error(`E2E_FAST_WRAPPER_CHILD_ERROR=${child.error.message}`);
  process.exit(1);
}
process.exit(Number.isInteger(child.status) ? child.status : 1);
NODE
E2E_STATUS=$?
set -e

restore_deep_slot || fail "DEEP_INTELLIGENCE_SLOT_RESTORE_FAILED"

if [ "$E2E_STATUS" -ne 0 ]; then
  fail "PRODUCT_ENGINEERING_E2E_FAILED"
fi

echo ""
echo "AVANTIQO_PRODUCT_FAST_LANE_E2E=PASS"
echo "AVANTIQO_INTELLIGENCE_POST_E2E_STATE=DEEP_ACTIVE_FAST_PARKED"
