#!/usr/bin/env bash
set -euo pipefail

ROOT="${AVANTIQO_PROJECT_ROOT:-$HOME/Projects/churchill-control-new}"

fail() {
  echo "AVANTIQO_INTELLIGENCE_FAST_RECOVER_PARITY=FAIL"
  echo "AVANTIQO_INTELLIGENCE_FAST_RECOVER_PARITY_REASON=$1"
  exit 1
}

[ -d "$ROOT/.git" ] || [ -f "$ROOT/.git" ] || fail "PROJECT_NOT_GIT_WORKTREE"
[ -f "$ROOT/.env.local" ] || fail "ENV_LOCAL_MISSING"
command -v git >/dev/null 2>&1 || fail "GIT_MISSING"
command -v node >/dev/null 2>&1 || fail "NODE_MISSING"

cd "$ROOT"

echo "============================================================"
echo "AVANTIQO FAST INTELLIGENCE - RECOVER + PARITY REPAIR"
echo "============================================================"
echo "GENERATION_SUBMITTED=NO"
echo "PRODUCTION_DEPLOY_PERFORMED=NO"
echo "SECRET_VALUES_PRINTED=NO"

git fetch origin main || fail "GIT_FETCH_ORIGIN_MAIN_FAILED"
[ "$(git branch --show-current)" = "main" ] || fail "LOCAL_MAIN_REQUIRED"
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] \
  || fail "LOCAL_MAIN_NOT_CURRENT_RUN_GIT_PULL_FF_ONLY"

node --check scripts/repair-avantiqo-intelligence-fast-template-convergence-v2-local.mjs \
  || fail "FAST_TEMPLATE_CONVERGENCE_V2_SYNTAX_FAILED"
node --check scripts/diagnose-avantiqo-intelligence-fast-endpoint-parity-local.mjs \
  || fail "FAST_ENDPOINT_PARITY_DIAGNOSTIC_SYNTAX_FAILED"
node --check scripts/repair-avantiqo-intelligence-fast-endpoint-placement-local.mjs \
  || fail "FAST_ENDPOINT_PLACEMENT_REPAIR_SYNTAX_FAILED"

echo ""
echo "================ RECOVER + CONVERGE FAST TEMPLATE ================"
AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_CONVERGENCE_APPROVED=YES \
AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_RECOVER_STALE_ACTIVE_APPROVED=YES \
  node --env-file=.env.local \
    scripts/repair-avantiqo-intelligence-fast-template-convergence-v2-local.mjs \
    --apply \
  || fail "FAST_TEMPLATE_RECOVERY_OR_CONVERGENCE_FAILED"

echo ""
echo "================ ENDPOINT PARITY BEFORE REPAIR ================"
node --env-file=.env.local \
  scripts/diagnose-avantiqo-intelligence-fast-endpoint-parity-local.mjs \
  || fail "FAST_ENDPOINT_PARITY_DIAGNOSTIC_BEFORE_FAILED"

echo ""
echo "================ CONVERGE FAST CUDA PLACEMENT ================"
AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_PLACEMENT_REPAIR_APPROVED=YES \
  node --env-file=.env.local \
    scripts/repair-avantiqo-intelligence-fast-endpoint-placement-local.mjs \
    --apply \
  || fail "FAST_ENDPOINT_PLACEMENT_REPAIR_FAILED"

echo ""
echo "================ ENDPOINT PARITY AFTER REPAIR ================"
node --env-file=.env.local \
  scripts/diagnose-avantiqo-intelligence-fast-endpoint-parity-local.mjs \
  || fail "FAST_ENDPOINT_PARITY_DIAGNOSTIC_AFTER_FAILED"

echo ""
echo "AVANTIQO_INTELLIGENCE_FAST_RECOVER_PARITY=PASS"
echo "NEXT_ACTION=REVIEW_PARITY_OUTPUT_BEFORE_ANY_NEW_GENERATION"
echo "GENERATION_SUBMITTED=NO"
echo "PRODUCTION_DEPLOY_PERFORMED=NO"
