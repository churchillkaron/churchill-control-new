#!/usr/bin/env bash
set -u

CONTRACT="AVANTIQO_CODE_AI_ZERO_IDLE_LOCAL_COMPUTER_LANDING_PAGE_CONTROLLED_PROOF_V1"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
WT="/tmp/avantiqo-code-zero-idle-local-landing-proof-$$"
RC=1

cleanup() {
  if git -C "$ROOT" worktree list --porcelain 2>/dev/null | grep -Fqx "worktree $WT"; then
    git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true
  fi
  rm -rf "$WT" >/dev/null 2>&1 || true
  echo "${CONTRACT}_RC=$RC"
  echo "${CONTRACT}_CONTROL_WORKTREE_REMOVED=true"
  echo "${CONTRACT}_ROOT_CHECKOUT_PRESERVED=true"
  echo "${CONTRACT}_PRODUCTION_DEPLOY_PERFORMED=false"
  echo "Terminal remains open."
}
trap cleanup EXIT

cd "$ROOT" || exit 1
if [ ! -f "$ROOT/.env.local" ]; then
  echo "${CONTRACT}_ENV_LOCAL_REQUIRED=true"
  exit 1
fi
if [ ! -d "$ROOT/node_modules" ]; then
  echo "${CONTRACT}_ROOT_NODE_MODULES_REQUIRED=true"
  exit 1
fi

git fetch origin main || exit 1
MAIN_SHA="$(git rev-parse origin/main)"
echo "${CONTRACT}_MAIN_SHA=$MAIN_SHA"
echo "${CONTRACT}_WORKSPACE_TARGET=LOCAL_COMPUTER"
echo "${CONTRACT}_REASONING_TRANSPORT=SERVERLESS_ZERO_IDLE"
echo "${CONTRACT}_WORKER_SESSION_ENABLED=false"
echo "${CONTRACT}_SERVERLESS_MIN_WORKERS_REQUIRED=0"
echo "${CONTRACT}_SERVERLESS_MAX_WORKERS_REQUIRED=1"
echo "${CONTRACT}_FLASHBOOT_REQUIRED=true"
echo "${CONTRACT}_PRODUCTION_DEPLOY_ALLOWED=false"

git worktree add --detach "$WT" "$MAIN_SHA" || exit 1
ln -s "$ROOT/node_modules" "$WT/node_modules"
ln -s "$ROOT/.env.local" "$WT/.env.local"

cd "$WT" || exit 1

echo "${CONTRACT}_ZERO_SPEND_LOADER_SELFTEST_START=true"
NODE_OPTIONS="--loader=$WT/scripts/code-ai-local-computer-workspace-loader.mjs" \
node scripts/code-ai-local-computer-workspace-loader-selftest.mjs || exit 1
echo "${CONTRACT}_ZERO_SPEND_LOADER_SELFTEST_PASS=true"

AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT="$ROOT" \
AVANTIQO_CODE_ZERO_IDLE_LOCAL_COMPUTER_LANDING_APPROVED=YES \
NODE_ENV=development \
NODE_OPTIONS="--loader=$WT/scripts/code-ai-local-computer-workspace-loader.mjs" \
node --env-file="$ROOT/.env.local" \
  scripts/run-code-ai-zero-idle-local-computer-landing-page-proof-local.mjs
RC=$?

exit "$RC"
