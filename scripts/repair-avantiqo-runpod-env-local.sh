#!/usr/bin/env bash

set -euo pipefail

ROOT="${AVANTIQO_PROJECT_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}"
ENV_LOCAL="$ROOT/.env.local"
TMP_ROOT=""

fail() {
  echo "AVANTIQO_RUNPOD_ENV_LOCAL_REPAIR=FAIL"
  echo "AVANTIQO_RUNPOD_ENV_LOCAL_REPAIR_REASON=$1"
  exit 1
}

cleanup() {
  if [ -n "$TMP_ROOT" ] && [ -d "$TMP_ROOT" ]; then
    rm -rf "$TMP_ROOT" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

command -v git >/dev/null 2>&1 || fail "GIT_REQUIRED"
command -v node >/dev/null 2>&1 || fail "NODE_REQUIRED"
[ -f "$ENV_LOCAL" ] || fail "ENV_LOCAL_REQUIRED"

TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/avantiqo-runpod-env-repair.XXXXXX")" || fail "TEMP_DIRECTORY_CREATE_FAILED"
chmod 700 "$TMP_ROOT"
IMPORTER="$TMP_ROOT/import-runpod-shell-env-local.mjs"

if ! git -C "$ROOT" show origin/main:scripts/import-runpod-shell-env-local.mjs > "$IMPORTER" 2>/dev/null; then
  git -C "$ROOT" fetch origin main >/dev/null 2>&1 || fail "FETCH_MAIN_FAILED"
  git -C "$ROOT" show origin/main:scripts/import-runpod-shell-env-local.mjs > "$IMPORTER" 2>/dev/null \
    || fail "IMPORTER_NOT_AVAILABLE_ON_MAIN"
fi
chmod 600 "$IMPORTER"

echo "AVANTIQO_RUNPOD_ENV_LOCAL_REPAIR_SECRET_VALUES_PRINTED=false"
echo "AVANTIQO_RUNPOD_ENV_LOCAL_REPAIR_SOURCE_ORDER=SHELL_OR_ENV_LOCAL_THEN_GITHUB_FALLBACK"

set +e
node "$IMPORTER" "$ENV_LOCAL"
IMPORT_STATUS=$?
set -e

if [ "$IMPORT_STATUS" -eq 0 ]; then
  echo "AVANTIQO_RUNPOD_ENV_LOCAL_REPAIR=PASS"
  exit 0
fi

if [ "$IMPORT_STATUS" -ne 2 ]; then
  fail "LOCAL_RUNPOD_CREDENTIAL_PRESENT_BUT_INVALID"
fi

command -v gh >/dev/null 2>&1 || fail "NO_LOCAL_RUNPOD_CREDENTIAL_AND_GITHUB_CLI_REQUIRED"

echo "AVANTIQO_RUNPOD_ENV_LOCAL_REPAIR_LOCAL_CREDENTIAL=NO"
echo "AVANTIQO_RUNPOD_ENV_LOCAL_REPAIR_GITHUB_FALLBACK=STARTING"

SYNC_SCRIPT="$TMP_ROOT/sync-avantiqo-runpod-secrets-local.sh"
git -C "$ROOT" show origin/main:scripts/sync-avantiqo-runpod-secrets-local.sh > "$SYNC_SCRIPT" 2>/dev/null \
  || fail "GITHUB_FALLBACK_SCRIPT_NOT_AVAILABLE"
chmod 700 "$SYNC_SCRIPT"

if AVANTIQO_PROJECT_ROOT="$ROOT" bash "$SYNC_SCRIPT"; then
  echo "AVANTIQO_RUNPOD_ENV_LOCAL_REPAIR=PASS"
  exit 0
fi

fail "NO_READABLE_RUNPOD_CREDENTIAL_SOURCE_FOUND"
