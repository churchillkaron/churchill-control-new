#!/usr/bin/env bash
set -euo pipefail

ROOT="${AVANTIQO_PROJECT_ROOT:-$HOME/Projects/churchill-control-new}"

fail() {
  echo "AVANTIQO_INTELLIGENCE_FAST_CONVERGED_FIRST_RESPONSE=FAIL"
  echo "AVANTIQO_INTELLIGENCE_FAST_CONVERGED_FIRST_RESPONSE_REASON=$1"
  exit 1
}

[ -d "$ROOT/.git" ] || [ -f "$ROOT/.git" ] || fail "PROJECT_NOT_GIT_WORKTREE"
[ -f "$ROOT/.env.local" ] || fail "ENV_LOCAL_MISSING"
command -v git >/dev/null 2>&1 || fail "GIT_MISSING"
command -v node >/dev/null 2>&1 || fail "NODE_MISSING"

cd "$ROOT"

echo "============================================================"
echo "AVANTIQO FAST INTELLIGENCE - CONVERGED FIRST RESPONSE"
echo "============================================================"
echo "PRODUCTION_DEPLOY_PERFORMED=NO"
echo "TEMPLATE_CONVERGENCE_REQUIRED_BEFORE_FAST_ACTIVATION=YES"
echo "SECRET_VALUES_PRINTED=NO"

git fetch origin main || fail "GIT_FETCH_ORIGIN_MAIN_FAILED"
CURRENT_BRANCH="$(git branch --show-current)"
[ "$CURRENT_BRANCH" = "main" ] || fail "LOCAL_MAIN_REQUIRED"
LOCAL_HEAD="$(git rev-parse HEAD)"
ORIGIN_MAIN="$(git rev-parse origin/main)"
[ "$LOCAL_HEAD" = "$ORIGIN_MAIN" ] || fail "LOCAL_MAIN_NOT_CURRENT_RUN_GIT_PULL_FF_ONLY"

node --check scripts/repair-avantiqo-intelligence-fast-template-convergence-local.mjs \
  || fail "FAST_TEMPLATE_CONVERGENCE_SYNTAX_FAILED"
bash -n scripts/run-avantiqo-intelligence-fast-first-response-local.sh \
  || fail "FAST_FIRST_RESPONSE_WRAPPER_SYNTAX_FAILED"

echo ""
echo "================ CONVERGE PARKED FAST TEMPLATE ================"
AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_CONVERGENCE_APPROVED=YES \
  node --env-file=.env.local \
    scripts/repair-avantiqo-intelligence-fast-template-convergence-local.mjs \
    --apply \
  || fail "FAST_TEMPLATE_CONVERGENCE_FAILED"

echo ""
echo "================ RUN ONE FAST FIRST RESPONSE ================"
bash scripts/run-avantiqo-intelligence-fast-first-response-local.sh \
  || fail "FAST_FIRST_RESPONSE_FAILED"

echo ""
echo "AVANTIQO_INTELLIGENCE_FAST_CONVERGED_FIRST_RESPONSE=PASS"
echo "AVANTIQO_INTELLIGENCE_POST_TEST_STATE=DEEP_ACTIVE_FAST_PARKED"
echo "PRODUCTION_DEPLOY_PERFORMED=NO"
