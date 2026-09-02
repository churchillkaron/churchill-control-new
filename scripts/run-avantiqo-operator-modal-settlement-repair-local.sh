#!/usr/bin/env bash
set -euo pipefail

CONTRACT="AVANTIQO_OPERATOR_MODAL_SETTLEMENT_REPAIR_WRAPPER_V1"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

[[ -d "$ROOT/node_modules" ]] || { echo "${CONTRACT}_LOCAL_NODE_MODULES_REQUIRED" >&2; false; }

TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/avantiqo-operator-modal-settlement-repair.XXXXXX")"
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
  node scripts/repair-avantiqo-operator-modal-settlement.mjs
  node --check lib/operator/runtime/OperatorOwnedIntelligenceServiceRuntime.js
  node --check lib/operator/runtime/OperatorReasoningRuntime.js
  node --check lib/operator/runtime/OperatorFastConversationRuntime.js
  git diff --check

  grep -q 'settleOperatorIntelligenceExecution' lib/operator/runtime/OperatorReasoningRuntime.js
  grep -q 'execution_lane: "deep"' lib/operator/runtime/OperatorReasoningRuntime.js
  grep -q 'execution_lane: "fast"' lib/operator/runtime/OperatorReasoningRuntime.js
  grep -q 'ownedOperatorIntelligenceSelectionPolicy' lib/operator/runtime/OperatorFastConversationRuntime.js
  grep -q 'settleOperatorIntelligenceExecution' lib/operator/runtime/OperatorFastConversationRuntime.js

  git add \
    lib/operator/runtime/OperatorReasoningRuntime.js \
    lib/operator/runtime/OperatorFastConversationRuntime.js
  git diff --cached --quiet && { echo "${CONTRACT}_NO_CHANGES_TO_COMMIT" >&2; false; }
  git commit -m "Settle owned Modal jobs across Operator runtime" >/dev/null

  git fetch origin main
  CURRENT_MAIN="$(git rev-parse origin/main)"
  if [[ "$CURRENT_MAIN" != "$BASE_SHA" ]]; then
    echo "${CONTRACT}_MAIN_MOVED_BEFORE_PUSH base=${BASE_SHA} current=${CURRENT_MAIN}" >&2
    false
  fi

  git push origin HEAD:main
  RESULT_SHA="$(git rev-parse HEAD)"
  echo "${CONTRACT}=PASS source_main=${BASE_SHA} result_main=${RESULT_SHA} local_branch_mutated=false production_vercel_deploy_performed=false terminal_close_requested=false"
)
