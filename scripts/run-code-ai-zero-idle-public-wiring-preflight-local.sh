#!/usr/bin/env bash
set -u

CONTRACT="AVANTIQO_CODE_ZERO_IDLE_PUBLIC_WIRING_PREFLIGHT_V1"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
WT="/tmp/avantiqo-code-zero-idle-public-wiring-$$"
RC=1

cleanup() {
  if git -C "$ROOT" worktree list --porcelain 2>/dev/null | grep -Fqx "worktree $WT"; then
    git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true
  fi
  rm -rf "$WT" >/dev/null 2>&1 || true
  echo "${CONTRACT}_RC=$RC"
  echo "${CONTRACT}_WORKTREE_REMOVED=true"
  echo "${CONTRACT}_ROOT_CHECKOUT_PRESERVED=true"
  echo "${CONTRACT}_MODEL_CALL_PERFORMED=false"
  echo "${CONTRACT}_GPU_INFERENCE_PERFORMED=false"
  echo "${CONTRACT}_WALLET_MUTATION_PERFORMED=false"
  echo "${CONTRACT}_RUNPOD_MUTATION_PERFORMED=false"
  echo "Terminal remains open."
}
trap cleanup EXIT

cd "$ROOT" || exit 1
git fetch origin main || exit 1
MAIN_SHA="$(git rev-parse origin/main)"
echo "${CONTRACT}_MAIN_SHA=$MAIN_SHA"

git worktree add --detach "$WT" "$MAIN_SHA" || exit 1
cd "$WT" || exit 1

node scripts/code-ai-zero-idle-public-wiring-audit.mjs || exit 1
node scripts/code-ai-work-package-json-envelope-audit.mjs || exit 1

RC=0
echo "${CONTRACT}_PASS=true"
exit 0