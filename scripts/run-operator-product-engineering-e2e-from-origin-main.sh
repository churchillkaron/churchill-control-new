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

source_sandbox_auth_mode() {
  node - "$SOURCE_ROOT/.env.local" <<'NODE'
const fs = require("node:fs");
const { parseEnv } = require("node:util");
const sourcePath = process.argv[2];
const parsed = parseEnv(fs.readFileSync(sourcePath, "utf8"));
const direct = Boolean(
  String(parsed.VERCEL_TOKEN || "").trim() &&
  String(parsed.VERCEL_PROJECT_ID || "").trim() &&
  String(parsed.VERCEL_TEAM_ID || parsed.VERCEL_ORG_ID || "").trim()
);
process.stdout.write(direct ? "DIRECT_TOKEN" : "OIDC_REFRESH");
NODE
}

prepare_shadow_env() {
  local auth_mode
  local source_env_hash_before
  local source_env_hash_after
  local vercel_cli
  local oidc_env_file

  source_env_hash_before="$(git hash-object "$SOURCE_ROOT/.env.local" 2>/dev/null || true)"
  [ -n "$source_env_hash_before" ] || fail "SOURCE_ENV_LOCAL_HASH_FAILED"

  auth_mode="$(source_sandbox_auth_mode)" || fail "SOURCE_ENV_LOCAL_PARSE_FAILED"

  if [ "$auth_mode" = "DIRECT_TOKEN" ]; then
    cp "$SOURCE_ROOT/.env.local" "$SHADOW_ROOT/.env.local" || fail "SHADOW_ENV_LOCAL_COPY_FAILED"
    chmod 600 "$SHADOW_ROOT/.env.local" 2>/dev/null || true
    echo "E2E_VERCEL_SANDBOX_AUTH=DIRECT_TOKEN"
    echo "E2E_VERCEL_OIDC_REFRESHED=NO"
  else
    [ -f "$SOURCE_ROOT/.vercel/project.json" ] || fail "SOURCE_VERCEL_PROJECT_LINK_MISSING"
    vercel_cli="$(resolve_vercel_cli)" || fail "VERCEL_CLI_MISSING"
    oidc_env_file="$SHADOW_PARENT/vercel-development.env"

    (
      cd "$SOURCE_ROOT" || exit 1
      "$vercel_cli" env pull "$oidc_env_file" --environment=development --yes >/dev/null 2>&1
    ) || fail "VERCEL_OIDC_REFRESH_FAILED"

    node - "$SOURCE_ROOT/.env.local" "$oidc_env_file" "$SHADOW_ROOT/.env.local" <<'NODE'
const fs = require("node:fs");
const { parseEnv } = require("node:util");

const sourcePath = process.argv[2];
const pulledPath = process.argv[3];
const targetPath = process.argv[4];
const source = fs.readFileSync(sourcePath, "utf8");
const pulled = parseEnv(fs.readFileSync(pulledPath, "utf8"));
const oidcToken = String(pulled.VERCEL_OIDC_TOKEN || "").trim();
if (!oidcToken) process.exit(2);

const filtered = source
  .split(/\r?\n/)
  .filter((line) => !/^\s*(?:export\s+)?VERCEL_OIDC_TOKEN\s*=/.test(line))
  .join("\n")
  .replace(/\s*$/, "");
const merged = `${filtered}\nVERCEL_OIDC_TOKEN=${JSON.stringify(oidcToken)}\n`;
fs.writeFileSync(targetPath, merged, { mode: 0o600 });
NODE
    [ "$?" -eq 0 ] || fail "VERCEL_OIDC_TOKEN_MISSING_AFTER_PULL"
    rm -f "$oidc_env_file"

    echo "E2E_VERCEL_SANDBOX_AUTH=FRESH_OIDC"
    echo "E2E_VERCEL_OIDC_REFRESHED=YES"
  fi

  source_env_hash_after="$(git hash-object "$SOURCE_ROOT/.env.local" 2>/dev/null || true)"
  [ "$source_env_hash_after" = "$source_env_hash_before" ] || fail "SOURCE_ENV_LOCAL_MUTATED"
  echo "E2E_SOURCE_ENV_LOCAL_MUTATED=NO"
  echo "E2E_VERCEL_SECRET_OUTPUT=NO"
}

command -v git >/dev/null 2>&1 || fail "GIT_MISSING"
command -v node >/dev/null 2>&1 || fail "NODE_MISSING"
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
