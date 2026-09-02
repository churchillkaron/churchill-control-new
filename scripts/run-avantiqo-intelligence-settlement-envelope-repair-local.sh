#!/usr/bin/env bash
set -euo pipefail

CONTRACT="AVANTIQO_INTELLIGENCE_SETTLEMENT_ENVELOPE_REPAIR_WRAPPER_V1"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/avantiqo-intelligence-envelope-repair.XXXXXX")"
WORKTREE="$TMP_ROOT/origin-main"
cleanup() {
  if [[ -e "$WORKTREE/.git" || -f "$WORKTREE/.git" ]]; then
    git -C "$ROOT" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

git fetch origin main
BASE_SHA="$(git rev-parse origin/main)"
[[ "$BASE_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "${CONTRACT}_ORIGIN_MAIN_SHA_INVALID" >&2; false; }

git worktree add --detach "$WORKTREE" "$BASE_SHA" >/dev/null
ln -s "$ROOT/node_modules" "$WORKTREE/node_modules"

(
  cd "$WORKTREE"
  node scripts/repair-avantiqo-intelligence-settlement-envelope.mjs
  node --check lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js
  node --test \
    tests/avantiqo-intelligence-settled-output-envelope.test.mjs \
    tests/avantiqo-intelligence-reasoning-modal-settlement-contract.test.mjs \
    tests/avantiqo-intelligence-safe-lease-provider-guard.test.mjs

  git diff --check
  git add \
    lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js
  git diff --cached --quiet && { echo "${CONTRACT}_NO_REPAIR_CHANGE" >&2; false; }

  git config user.name "Avantiqo Intelligence Repair"
  git config user.email "avantiqo-intelligence-repair@local.invalid"
  git commit -m "Decode first-settlement Intelligence output envelope" >/dev/null
  RESULT_SHA="$(git rev-parse HEAD)"

  git fetch origin main
  CURRENT_MAIN="$(git rev-parse origin/main)"
  if [[ "$CURRENT_MAIN" != "$BASE_SHA" ]]; then
    echo "${CONTRACT}_MAIN_MOVED_BEFORE_PUSH:${BASE_SHA}:${CURRENT_MAIN}" >&2
    false
  fi

  git push origin HEAD:main
  echo "${CONTRACT}=PASS source_main=${BASE_SHA} result_main=${RESULT_SHA} local_branch_mutated=false production_vercel_deploy_performed=false terminal_close_requested=false gpu_inference_performed=false"
)
