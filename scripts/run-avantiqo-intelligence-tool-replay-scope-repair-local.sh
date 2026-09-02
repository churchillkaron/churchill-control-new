#!/usr/bin/env bash
set -euo pipefail

CONTRACT="AVANTIQO_INTELLIGENCE_TOOL_REPLAY_SCOPE_REPAIR_WRAPPER_V1"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

[[ -d "$ROOT/node_modules" ]] || { echo "${CONTRACT}_LOCAL_NODE_MODULES_REQUIRED" >&2; false; }

TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/avantiqo-intelligence-replay-repair.XXXXXX")"
WORKTREE="$TMP_ROOT/origin-main"

cleanup() {
  if [[ -e "$WORKTREE/.git" || -f "$WORKTREE/.git" ]]; then
    git -C "$ROOT" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

git fetch origin main
SOURCE_MAIN="$(git rev-parse origin/main)"
[[ "$SOURCE_MAIN" =~ ^[0-9a-f]{40}$ ]] || { echo "${CONTRACT}_ORIGIN_MAIN_SHA_INVALID" >&2; false; }

git worktree add --detach "$WORKTREE" "$SOURCE_MAIN" >/dev/null
ln -s "$ROOT/node_modules" "$WORKTREE/node_modules"

(
  cd "$WORKTREE"
  node scripts/repair-avantiqo-intelligence-tool-replay-scope.mjs
  node --check lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js
  node --test \
    tests/avantiqo-intelligence-tool-replay-scope.test.mjs \
    tests/avantiqo-intelligence-modal-tool-id-contract.test.mjs \
    tests/avantiqo-intelligence-reasoning-loop-contract.test.mjs \
    tests/avantiqo-intelligence-reasoning-modal-settlement-contract.test.mjs \
    tests/avantiqo-intelligence-settled-output-envelope.test.mjs \
    tests/avantiqo-intelligence-safe-lease-provider-guard.test.mjs

  changed="$(git diff --name-only)"
  [[ "$changed" == "lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js" ]] || {
    echo "${CONTRACT}_UNEXPECTED_CHANGED_FILES:${changed}" >&2
    false
  }

  git config user.name "Avantiqo Intelligence Repair"
  git config user.email "avantiqo-intelligence-repair@local.invalid"
  git add lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js
  git commit -m "Scope Intelligence tool replay guard per model completion" >/dev/null
  RESULT_SHA="$(git rev-parse HEAD)"

  git fetch origin main
  LATEST_MAIN="$(git rev-parse origin/main)"
  [[ "$LATEST_MAIN" == "$SOURCE_MAIN" ]] || {
    echo "${CONTRACT}_ORIGIN_MAIN_MOVED source=${SOURCE_MAIN} latest=${LATEST_MAIN} push_performed=false" >&2
    false
  }

  git push origin HEAD:main
  echo "${CONTRACT}=PASS source_main=${SOURCE_MAIN} result_main=${RESULT_SHA} local_branch_mutated=false production_vercel_deploy_performed=false terminal_close_requested=false gpu_inference_performed=false"
)
