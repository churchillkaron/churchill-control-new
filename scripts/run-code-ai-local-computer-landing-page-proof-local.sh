#!/usr/bin/env bash
set -u

CONTRACT="AVANTIQO_CODE_AI_LOCAL_COMPUTER_LANDING_PAGE_CONTROLLED_PROOF_V1"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
WT="/tmp/avantiqo-code-local-landing-proof-$$"
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
echo "${CONTRACT}_AI_WRITES_SOURCE=true"
echo "${CONTRACT}_AI_RUNS_LOCAL_BUILD_AND_VERIFIER=true"
echo "${CONTRACT}_AI_REVIEWS_FINAL_DIFF=true"
echo "${CONTRACT}_REASONING_CALL_BUDGET=4"
echo "${CONTRACT}_PRODUCTION_DEPLOY_ALLOWED=false"

git worktree add --detach "$WT" "$MAIN_SHA" || exit 1
ln -s "$ROOT/node_modules" "$WT/node_modules"
ln -s "$ROOT/.env.local" "$WT/.env.local"

cd "$WT" || exit 1

NODE_ENV=development \
AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT="$ROOT" \
AVANTIQO_CODE_LOCAL_COMPUTER_LANDING_APPROVED=YES \
NODE_OPTIONS="--loader=$WT/scripts/code-ai-local-computer-workspace-loader.mjs" \
node --env-file="$ROOT/.env.local" \
  scripts/run-code-ai-local-computer-landing-page-proof-local.mjs || exit 1

RC=0
echo "${CONTRACT}_PASS=true"
echo "${CONTRACT}_PREVIEW_PATH=$ROOT/local-audit-output/avantiqo-code-ai-landing-page-proof/landing-page.html"
echo "${CONTRACT}_SOURCE_PATH=$ROOT/local-audit-output/avantiqo-code-ai-landing-page-proof/source"
echo "${CONTRACT}_PROOF_PATH=$ROOT/local-audit-output/avantiqo-code-ai-landing-page-proof/proof.json"
exit 0
