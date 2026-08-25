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

command -v git >/dev/null 2>&1 || fail "GIT_MISSING"
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
ln -s "$SOURCE_ROOT/.env.local" "$SHADOW_ROOT/.env.local" || fail "ENV_LOCAL_LINK_FAILED"

if [ "$SHADOW_HEAD" != "$SOURCE_ORIGIN_MAIN" ]; then
  echo "E2E_CONCURRENT_MAIN_ADVANCE_DURING_CLONE=YES"
else
  echo "E2E_CONCURRENT_MAIN_ADVANCE_DURING_CLONE=NO"
fi

echo ""
echo "================ VERIFY LATEST PRODUCT CONTRACT ================"n
node --test "$SHADOW_ROOT/tests/avantiqo-intelligence-supervisor-contract.test.mjs" || fail "PRODUCT_SUPERVISOR_CONTRACT_TEST_FAILED"

echo ""
echo "================ RUN REAL PRODUCT E2E ================"
AVANTIQO_PROJECT_ROOT="$SHADOW_ROOT" \
  bash "$SHADOW_ROOT/scripts/run-operator-product-engineering-e2e.sh"
E2E_STATUS=$?

if [ "$E2E_STATUS" -ne 0 ]; then
  fail "PRODUCT_ENGINEERING_E2E_FAILED"
fi

echo ""
echo "E2E_ORIGIN_MAIN_RUNNER=PASS"
echo "E2E_ORIGIN_MAIN_HEAD=$SHADOW_HEAD"
echo "E2E_SOURCE_CHECKOUT_MUTATED=NO"
