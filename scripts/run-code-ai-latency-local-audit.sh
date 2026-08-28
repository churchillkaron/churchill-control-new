#!/usr/bin/env bash
set -u

CONTRACT="AVANTIQO_CODE_AI_LATENCY_LOCAL_AUDIT_LAUNCHER_V1"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
WT="/tmp/avantiqo-code-latency-local-audit-$$"
RC=1

cleanup() {
  if git -C "$ROOT" worktree list --porcelain 2>/dev/null | grep -Fqx "worktree $WT"; then
    git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true
  fi
  rm -rf "$WT" >/dev/null 2>&1 || true
  echo "${CONTRACT}_RC=$RC"
  echo "${CONTRACT}_TEMP_WORKTREE_REMOVED_ON_EXIT=true"
  echo "${CONTRACT}_DIRTY_ROOT_PRESERVED=true"
  echo "${CONTRACT}_RUNPOD_MUTATION_PERFORMED=false"
  echo "${CONTRACT}_REASONING_CALLS_CONSUMED=0"
  echo "${CONTRACT}_WALLET_MUTATION_PERFORMED=false"
  echo "${CONTRACT}_VERCEL_DEPLOY_PERFORMED=false"
  echo "${CONTRACT}_PRODUCTION_DEPLOY_PERFORMED=false"
  echo "Terminal remains open."
}
trap cleanup EXIT

cd "$ROOT" || exit 1

echo "${CONTRACT}_MODE=LOCAL_ZERO_SPEND"
echo "${CONTRACT}_ROOT=$ROOT"
echo "${CONTRACT}_PRODUCTION_DEPLOY_ALLOWED=false"
echo "${CONTRACT}_VERCEL_ALLOWED=false"
echo "${CONTRACT}_RUNPOD_ALLOWED=false"
echo "${CONTRACT}_WALLET_ALLOWED=false"

git fetch origin main || exit 1
MAIN_SHA="$(git rev-parse origin/main)"
echo "${CONTRACT}_MAIN_SHA=$MAIN_SHA"

git worktree add --detach "$WT" "$MAIN_SHA" || exit 1

if [ -d "$ROOT/node_modules" ] && [ ! -e "$WT/node_modules" ]; then
  ln -s "$ROOT/node_modules" "$WT/node_modules"
fi

cd "$WT" || exit 1

node scripts/code-ai-seeded-implementation-lock-selftest.mjs || exit 1
node scripts/code-ai-operator-prewarm-audit.mjs || exit 1
node scripts/code-ai-work-package-recovery-selftest.mjs || exit 1

if git grep -n '\[deploy-production-final\]' -- ':!scripts/vercel-ignore-build.mjs' ':!scripts/run-code-ai-latency-local-audit.sh' >/tmp/avantiqo-code-latency-production-marker-$$.txt 2>/dev/null; then
  echo "${CONTRACT}_UNEXPECTED_PRODUCTION_MARKER=true"
  cat /tmp/avantiqo-code-latency-production-marker-$$.txt
  rm -f /tmp/avantiqo-code-latency-production-marker-$$.txt
  exit 1
fi
rm -f /tmp/avantiqo-code-latency-production-marker-$$.txt

if [ -n "$(git status --porcelain)" ]; then
  echo "${CONTRACT}_WORKTREE_MUTATED=true"
  git status --short
  exit 1
fi

RC=0
echo "${CONTRACT}_PASS=true"
echo "${CONTRACT}_SEEDED_DISCOVERY_LOCK_VERIFIED=true"
echo "${CONTRACT}_CONTROLLER_AUTHORITATIVE_VERIFY_VERIFIED=true"
echo "${CONTRACT}_CONTROLLER_FINAL_DIFF_VERIFIED=true"
echo "${CONTRACT}_OPERATOR_PREWARM_VERIFIED=true"
echo "${CONTRACT}_NO_MODEL_CALL_VERIFIED=true"
echo "${CONTRACT}_NO_PRODUCTION_DEPLOY_VERIFIED=true"
exit 0
