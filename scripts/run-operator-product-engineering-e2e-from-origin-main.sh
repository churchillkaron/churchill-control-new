#!/usr/bin/env bash

set -u

SOURCE_ROOT="${AVANTIQO_PROJECT_ROOT:-$HOME/Projects/churchill-control-new}"
TMP_PARENT="${TMPDIR:-/tmp}"
SHADOW_PARENT=""
SHADOW_ROOT=""

fail() {
  echo ""
  echo "E2E_ORIGIN_MAIN_RUNNER=FAIL"
  echo "E2E_ORIGIN_MAIN_REASON=$1"
  exit 1
}

cleanup() {
  if [ -n "$SHADOW_PARENT" ] && [ -d "$SHADOW_PARENT" ]; then
    rm -rf "$SHADOW_PARENT" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

resolve_vercel_cli() {
  if [ -n "${AVANTIQO_VERCEL_CLI:-}" ] && [ -x "${AVANTIQO_VERCEL_CLI}" ]; then
    printf '%s' "$AVANTIQO_VERCEL_CLI"
    return 0
  fi
  if [ -x "$SOURCE_ROOT/node_modules/.bin/vercel" ]; then
    printf '%s' "$SOURCE_ROOT/node_modules/.bin/vercel"
    return 0
  fi
  command -v vercel 2>/dev/null || return 1
}

prepare_shadow_env() {
  local source_env_hash_before
  local source_env_hash_after
  local vercel_cli
  local pulled_env_file
  local env_preflight

  source_env_hash_before="$(git hash-object "$SOURCE_ROOT/.env.local" 2>/dev/null || true)"
  [ -n "$source_env_hash_before" ] || fail "SOURCE_ENV_LOCAL_HASH_FAILED"
  [ -f "$SOURCE_ROOT/.vercel/project.json" ] || fail "SOURCE_VERCEL_PROJECT_LINK_MISSING"
  vercel_cli="$(resolve_vercel_cli)" || fail "VERCEL_CLI_MISSING"
  pulled_env_file="$SHADOW_PARENT/vercel-development.env"

  (
    cd "$SOURCE_ROOT" || exit 1
    "$vercel_cli" env pull "$pulled_env_file" --environment=development --yes >/dev/null 2>&1
  ) || fail "VERCEL_DEVELOPMENT_ENV_PULL_FAILED"

  env_preflight="$(
    node - "$SOURCE_ROOT/.env.local" "$pulled_env_file" "$SHADOW_ROOT/.env.local" <<'NODE'
const fs = require("node:fs");
const { parseEnv } = require("node:util");

const sourcePath = process.argv[2];
const pulledPath = process.argv[3];
const targetPath = process.argv[4];
const local = parseEnv(fs.readFileSync(sourcePath, "utf8"));
const pulled = parseEnv(fs.readFileSync(pulledPath, "utf8"));
const merged = { ...pulled };

for (const [key, value] of Object.entries(local)) {
  const normalized = String(value ?? "");
  if (normalized.trim()) merged[key] = normalized;
}

const validEntries = Object.entries(merged)
  .filter(([key]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
  .sort(([left], [right]) => left.localeCompare(right));

const serialized = validEntries
  .map(([key, value]) => `${key}=${JSON.stringify(String(value ?? ""))}`)
  .join("\n") + "\n";
fs.writeFileSync(targetPath, serialized, { mode: 0o600 });

const truthy = (key) => Boolean(String(merged[key] ?? "").trim());
const directSandbox = Boolean(
  truthy("VERCEL_TOKEN") &&
  truthy("VERCEL_PROJECT_ID") &&
  (truthy("VERCEL_TEAM_ID") || truthy("VERCEL_ORG_ID"))
);
const oidc = truthy("VERCEL_OIDC_TOKEN");
const runtimeKey = truthy("RUNPOD_API_KEY");
const managementKey = truthy("RUNPOD_MANAGEMENT_API_KEY");
const endpointId = truthy("RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID");
const intelligenceEndpointResolvable = endpointId || managementKey || runtimeKey;

process.stdout.write([
  `SANDBOX_AUTH=${directSandbox ? "DIRECT_TOKEN" : oidc ? "FRESH_OIDC" : "MISSING"}`,
  `OIDC=${oidc ? "YES" : "NO"}`,
  `RUNPOD_API_KEY=${runtimeKey ? "YES" : "NO"}`,
  `RUNPOD_MANAGEMENT_API_KEY=${managementKey ? "YES" : "NO"}`,
  `INTELLIGENCE_ENDPOINT_ID=${endpointId ? "YES" : "NO"}`,
  `INTELLIGENCE_ENDPOINT_RESOLVABLE=${intelligenceEndpointResolvable ? "YES" : "NO"}`,
].join("\n"));
NODE
  )" || fail "SHADOW_ENV_MERGE_FAILED"

  rm -f "$pulled_env_file"

  echo "E2E_VERCEL_SANDBOX_AUTH=$(printf '%s\n' "$env_preflight" | awk -F= '$1=="SANDBOX_AUTH" {print $2; exit}')"
  echo "E2E_VERCEL_OIDC_CONFIGURED=$(printf '%s\n' "$env_preflight" | awk -F= '$1=="OIDC" {print $2; exit}')"
  echo "E2E_INTELLIGENCE_RUNPOD_API_KEY_CONFIGURED=$(printf '%s\n' "$env_preflight" | awk -F= '$1=="RUNPOD_API_KEY" {print $2; exit}')"
  echo "E2E_INTELLIGENCE_RUNPOD_MANAGEMENT_KEY_CONFIGURED=$(printf '%s\n' "$env_preflight" | awk -F= '$1=="RUNPOD_MANAGEMENT_API_KEY" {print $2; exit}')"
  echo "E2E_INTELLIGENCE_ENDPOINT_ID_CONFIGURED=$(printf '%s\n' "$env_preflight" | awk -F= '$1=="INTELLIGENCE_ENDPOINT_ID" {print $2; exit}')"
  echo "E2E_INTELLIGENCE_ENDPOINT_RESOLVABLE=$(printf '%s\n' "$env_preflight" | awk -F= '$1=="INTELLIGENCE_ENDPOINT_RESOLVABLE" {print $2; exit}')"

  [ "$(printf '%s\n' "$env_preflight" | awk -F= '$1=="SANDBOX_AUTH" {print $2; exit}')" != "MISSING" ] || fail "VERCEL_SANDBOX_CREDENTIALS_MISSING_AFTER_ENV_MERGE"
  [ "$(printf '%s\n' "$env_preflight" | awk -F= '$1=="RUNPOD_API_KEY" {print $2; exit}')" = "YES" ] || fail "INTELLIGENCE_RUNPOD_API_KEY_MISSING_AFTER_ENV_MERGE"
  [ "$(printf '%s\n' "$env_preflight" | awk -F= '$1=="INTELLIGENCE_ENDPOINT_RESOLVABLE" {print $2; exit}')" = "YES" ] || fail "INTELLIGENCE_ENDPOINT_NOT_RESOLVABLE_AFTER_ENV_MERGE"

  source_env_hash_after="$(git hash-object "$SOURCE_ROOT/.env.local" 2>/dev/null || true)"
  [ "$source_env_hash_after" = "$source_env_hash_before" ] || fail "SOURCE_ENV_LOCAL_MUTATED"
  echo "E2E_SOURCE_ENV_LOCAL_MUTATED=NO"
  echo "E2E_VERCEL_DEVELOPMENT_ENV_MERGED=YES"
  echo "E2E_SECRET_VALUES_PRINTED=NO"
}

command -v git >/dev/null 2>&1 || fail "GIT_MISSING"
command -v node >/dev/null 2>&1 || fail "NODE_MISSING"
command -v awk >/dev/null 2>&1 || fail "AWK_MISSING"
[ -d "$SOURCE_ROOT/.git" ] || [ -f "$SOURCE_ROOT/.git" ] || fail "SOURCE_PROJECT_NOT_GIT_WORKTREE"
[ -d "$SOURCE_ROOT/node_modules" ] || fail "SOURCE_NODE_MODULES_MISSING"
[ -f "$SOURCE_ROOT/.env.local" ] || fail "SOURCE_ENV_LOCAL_MISSING"

echo "============================================================"
echo "AVANTIQO PRODUCT E2E ISOLATED ORIGIN MAIN RUNNER"
echo "============================================================"
echo "Source project:     $SOURCE_ROOT"
echo ""

echo "================ FETCH AUTHORITATIVE MAIN ================"
git -C "$SOURCE_ROOT" fetch origin main || fail "GIT_FETCH_ORIGIN_MAIN_FAILED"
REMOTE_URL="$(git -C "$SOURCE_ROOT" remote get-url origin 2>/dev/null || true)"
[ -n "$REMOTE_URL" ] || fail "ORIGIN_REMOTE_URL_MISSING"
SOURCE_ORIGIN_MAIN="$(git -C "$SOURCE_ROOT" rev-parse origin/main 2>/dev/null || true)"
[ -n "$SOURCE_ORIGIN_MAIN" ] || fail "ORIGIN_MAIN_SHA_MISSING"
echo "SOURCE_ORIGIN_MAIN=$SOURCE_ORIGIN_MAIN"

echo ""
echo "================ CREATE ISOLATED MAIN RUNNER ================"
SHADOW_PARENT="$(mktemp -d "$TMP_PARENT/avantiqo-origin-main-e2e.XXXXXX")" || fail "TEMP_DIRECTORY_CREATE_FAILED"
SHADOW_ROOT="$SHADOW_PARENT/repo"
git clone --quiet --depth 1 --single-branch --branch main "$REMOTE_URL" "$SHADOW_ROOT" || fail "ORIGIN_MAIN_CLONE_FAILED"
SHADOW_HEAD="$(git -C "$SHADOW_ROOT" rev-parse HEAD 2>/dev/null || true)"
SHADOW_REMOTE_MAIN="$(git -C "$SHADOW_ROOT" rev-parse origin/main 2>/dev/null || true)"
[ -n "$SHADOW_HEAD" ] || fail "ISOLATED_HEAD_MISSING"
[ "$SHADOW_HEAD" = "$SHADOW_REMOTE_MAIN" ] || fail "ISOLATED_HEAD_NOT_ORIGIN_MAIN"
echo "ISOLATED_MAIN_HEAD=$SHADOW_HEAD"
echo "E2E_SOURCE_CHECKOUT_MUTATED=NO"

ln -s "$SOURCE_ROOT/node_modules" "$SHADOW_ROOT/node_modules" || fail "NODE_MODULES_LINK_FAILED"
prepare_shadow_env

if [ "$SHADOW_HEAD" != "$SOURCE_ORIGIN_MAIN" ]; then
  echo "E2E_CONCURRENT_MAIN_ADVANCE_DURING_CLONE=YES"
else
  echo "E2E_CONCURRENT_MAIN_ADVANCE_DURING_CLONE=NO"
fi

echo ""
echo "================ VERIFY LATEST PRODUCT CONTRACT ================"
node --test "$SHADOW_ROOT/tests/avantiqo-intelligence-supervisor-contract.test.mjs" || fail "PRODUCT_SUPERVISOR_CONTRACT_TEST_FAILED"

echo ""
echo "================ RUN REAL PRODUCT E2E ================"
if [ -z "${FINANCE_SMOKE_EMAIL:-}" ] || [ -z "${FINANCE_SMOKE_PASSWORD:-}" ]; then
  [ -r /dev/tty ] || fail "INTERACTIVE_TTY_REQUIRED_FOR_AUTHENTICATION"
  echo "E2E_AUTH_INPUT_SOURCE=TERMINAL"
  AVANTIQO_PROJECT_ROOT="$SHADOW_ROOT" \
    bash "$SHADOW_ROOT/scripts/run-operator-product-engineering-e2e.sh" </dev/tty
else
  echo "E2E_AUTH_INPUT_SOURCE=ENVIRONMENT"
  AVANTIQO_PROJECT_ROOT="$SHADOW_ROOT" \
    bash "$SHADOW_ROOT/scripts/run-operator-product-engineering-e2e.sh"
fi
E2E_STATUS=$?

if [ "$E2E_STATUS" -ne 0 ]; then
  fail "PRODUCT_ENGINEERING_E2E_FAILED"
fi

echo ""
echo "E2E_ORIGIN_MAIN_RUNNER=PASS"
echo "E2E_ORIGIN_MAIN_HEAD=$SHADOW_HEAD"
echo "E2E_SOURCE_CHECKOUT_MUTATED=NO"
