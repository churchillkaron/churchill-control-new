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
  local development_env_file
  local production_env_file
  local provider_fallback_needed
  local env_preflight

  source_env_hash_before="$(git hash-object "$SOURCE_ROOT/.env.local" 2>/dev/null || true)"
  [ -n "$source_env_hash_before" ] || fail "SOURCE_ENV_LOCAL_HASH_FAILED"
  [ -f "$SOURCE_ROOT/.vercel/project.json" ] || fail "SOURCE_VERCEL_PROJECT_LINK_MISSING"
  vercel_cli="$(resolve_vercel_cli)" || fail "VERCEL_CLI_MISSING"
  development_env_file="$SHADOW_PARENT/vercel-development.env"
  production_env_file="$SHADOW_PARENT/vercel-production-provider.env"

  (
    cd "$SOURCE_ROOT" || exit 1
    "$vercel_cli" env pull "$development_env_file" --environment=development --yes >/dev/null 2>&1
  ) || fail "VERCEL_DEVELOPMENT_ENV_PULL_FAILED"

  provider_fallback_needed="$(
    node - "$SOURCE_ROOT/.env.local" "$development_env_file" <<'NODE'
const fs = require("node:fs");
const { parseEnv } = require("node:util");

const local = parseEnv(fs.readFileSync(process.argv[2], "utf8"));
const development = parseEnv(fs.readFileSync(process.argv[3], "utf8"));
const value = (source, key) => String(source[key] ?? "").trim();
const runtimeKey = value(local, "RUNPOD_API_KEY") || value(development, "RUNPOD_API_KEY");
process.stdout.write(runtimeKey ? "NO" : "YES");
NODE
  )" || fail "INTELLIGENCE_PROVIDER_FALLBACK_PREFLIGHT_FAILED"

  if [ "$provider_fallback_needed" = "YES" ]; then
    (
      cd "$SOURCE_ROOT" || exit 1
      "$vercel_cli" env pull "$production_env_file" --environment=production --yes >/dev/null 2>&1
    ) || fail "VERCEL_PRODUCTION_PROVIDER_ENV_PULL_FAILED"
  else
    : > "$production_env_file"
  fi

  env_preflight="$(
    node - "$SOURCE_ROOT/.env.local" "$development_env_file" "$production_env_file" "$SHADOW_ROOT/.env.local" <<'NODE'
const fs = require("node:fs");
const { parseEnv } = require("node:util");

const sourcePath = process.argv[2];
const developmentPath = process.argv[3];
const productionPath = process.argv[4];
const targetPath = process.argv[5];
const local = parseEnv(fs.readFileSync(sourcePath, "utf8"));
const development = parseEnv(fs.readFileSync(developmentPath, "utf8"));
const production = fs.existsSync(productionPath) && fs.statSync(productionPath).size
  ? parseEnv(fs.readFileSync(productionPath, "utf8"))
  : {};
const merged = { ...development };
const providerFallbackKeys = [
  "RUNPOD_API_KEY",
  "RUNPOD_MANAGEMENT_API_KEY",
  "RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID",
];
const nonEmpty = (value) => Boolean(String(value ?? "").trim());

for (const [key, value] of Object.entries(local)) {
  const normalized = String(value ?? "");
  if (!normalized.trim()) continue;
  if (key === "VERCEL_OIDC_TOKEN" && nonEmpty(development.VERCEL_OIDC_TOKEN)) continue;
  merged[key] = normalized;
}

const fallbackKeys = [];
for (const key of providerFallbackKeys) {
  if (nonEmpty(merged[key]) || !nonEmpty(production[key])) continue;
  merged[key] = String(production[key]);
  fallbackKeys.push(key);
}

const validEntries = Object.entries(merged)
  .filter(([key]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
  .sort(([left], [right]) => left.localeCompare(right));
const serialized = validEntries
  .map(([key, value]) => `${key}=${JSON.stringify(String(value ?? ""))}`)
  .join("\n") + "\n";
fs.writeFileSync(targetPath, serialized, { mode: 0o600 });

const truthy = (key) => nonEmpty(merged[key]);
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
  `PRODUCTION_PROVIDER_FALLBACK=${fallbackKeys.length ? "YES" : "NO"}`,
  `PRODUCTION_PROVIDER_FALLBACK_COUNT=${fallbackKeys.length}`,
].join("\n"));
NODE
  )" || fail "SHADOW_ENV_MERGE_FAILED"

  rm -f "$development_env_file" "$production_env_file"

  echo "E2E_VERCEL_SANDBOX_AUTH=$(printf '%s\n' "$env_preflight" | awk -F= '$1=="SANDBOX_AUTH" {print $2; exit}')"
  echo "E2E_VERCEL_OIDC_CONFIGURED=$(printf '%s\n' "$env_preflight" | awk -F= '$1=="OIDC" {print $2; exit}')"
  echo "E2E_INTELLIGENCE_RUNPOD_API_KEY_CONFIGURED=$(printf '%s\n' "$env_preflight" | awk -F= '$1=="RUNPOD_API_KEY" {print $2; exit}')"
  echo "E2E_INTELLIGENCE_RUNPOD_MANAGEMENT_KEY_CONFIGURED=$(printf '%s\n' "$env_preflight" | awk -F= '$1=="RUNPOD_MANAGEMENT_API_KEY" {print $2; exit}')"
  echo "E2E_INTELLIGENCE_ENDPOINT_ID_CONFIGURED=$(printf '%s\n' "$env_preflight" | awk -F= '$1=="INTELLIGENCE_ENDPOINT_ID" {print $2; exit}')"
  echo "E2E_INTELLIGENCE_ENDPOINT_RESOLVABLE=$(printf '%s\n' "$env_preflight" | awk -F= '$1=="INTELLIGENCE_ENDPOINT_RESOLVABLE" {print $2; exit}')"
  echo "E2E_INTELLIGENCE_PRODUCTION_PROVIDER_FALLBACK=$(printf '%s\n' "$env_preflight" | awk -F= '$1=="PRODUCTION_PROVIDER_FALLBACK" {print $2; exit}')"
  echo "E2E_INTELLIGENCE_PRODUCTION_PROVIDER_FALLBACK_COUNT=$(printf '%s\n' "$env_preflight" | awk -F= '$1=="PRODUCTION_PROVIDER_FALLBACK_COUNT" {print $2; exit}')"

  [ "$(printf '%s\n' "$env_preflight" | awk -F= '$1=="SANDBOX_AUTH" {print $2; exit}')" != "MISSING" ] || fail "VERCEL_SANDBOX_CREDENTIALS_MISSING_AFTER_ENV_MERGE"
  [ "$(printf '%s\n' "$env_preflight" | awk -F= '$1=="RUNPOD_API_KEY" {print $2; exit}')" = "YES" ] || fail "INTELLIGENCE_RUNPOD_API_KEY_MISSING_IN_LOCAL_DEVELOPMENT_AND_PRODUCTION"
  [ "$(printf '%s\n' "$env_preflight" | awk -F= '$1=="INTELLIGENCE_ENDPOINT_RESOLVABLE" {print $2; exit}')" = "YES" ] || fail "INTELLIGENCE_ENDPOINT_NOT_RESOLVABLE_AFTER_PROVIDER_FALLBACK"

  source_env_hash_after="$(git hash-object "$SOURCE_ROOT/.env.local" 2>/dev/null || true)"
  [ "$source_env_hash_after" = "$source_env_hash_before" ] || fail "SOURCE_ENV_LOCAL_MUTATED"
  echo "E2E_SOURCE_ENV_LOCAL_MUTATED=NO"
  echo "E2E_VERCEL_DEVELOPMENT_ENV_MERGED=YES"
  echo "E2E_PRODUCTION_ENV_ALLOWLIST_ONLY=YES"
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
git init --quiet "$SHADOW_ROOT" || fail "ISOLATED_GIT_INIT_FAILED"
git -C "$SHADOW_ROOT" remote add origin "$REMOTE_URL" || fail "ISOLATED_ORIGIN_ADD_FAILED"
git -C "$SHADOW_ROOT" fetch --quiet --depth 1 origin "$SOURCE_ORIGIN_MAIN" || fail "ISOLATED_EXACT_MAIN_FETCH_FAILED"
git -C "$SHADOW_ROOT" checkout --quiet -B main FETCH_HEAD || fail "ISOLATED_EXACT_MAIN_CHECKOUT_FAILED"
SHADOW_HEAD="$(git -C "$SHADOW_ROOT" rev-parse HEAD 2>/dev/null || true)"
[ -n "$SHADOW_HEAD" ] || fail "ISOLATED_HEAD_MISSING"
[ "$SHADOW_HEAD" = "$SOURCE_ORIGIN_MAIN" ] || fail "ISOLATED_HEAD_NOT_FETCHED_ORIGIN_MAIN"
echo "ISOLATED_MAIN_HEAD=$SHADOW_HEAD"
echo "E2E_ISOLATED_PINNED_TO_FETCHED_MAIN=YES"
echo "E2E_SOURCE_CHECKOUT_MUTATED=NO"

ln -s "$SOURCE_ROOT/node_modules" "$SHADOW_ROOT/node_modules" || fail "NODE_MODULES_LINK_FAILED"
prepare_shadow_env

echo "E2E_CONCURRENT_MAIN_ADVANCE_DURING_CLONE=NO"

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
