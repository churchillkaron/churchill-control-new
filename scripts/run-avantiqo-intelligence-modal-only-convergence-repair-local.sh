#!/usr/bin/env bash
set -euo pipefail

CONTRACT="AVANTIQO_INTELLIGENCE_MODAL_ONLY_CONVERGENCE_WRAPPER_V1"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

[[ -d "$ROOT/node_modules" ]] || { echo "${CONTRACT}_LOCAL_NODE_MODULES_REQUIRED" >&2; false; }

TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/avantiqo-intelligence-modal-only.XXXXXX")"
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

  node scripts/repair-avantiqo-intelligence-modal-only-convergence.mjs

  node --check lib/operator/runtime/OperatorReasoningRuntime.js
  node --check app/api/operator/turn/route.js
  node --check lib/intelligence/runtime/AvantiqoMechanismFirstLearningRuntime.js
  node --check scripts/run-avantiqo-learning-mechanism-synthesis-modal-child-local.mjs
  node --check scripts/avantiqo-learning-worldclass-phase4-audit.mjs
  node --check tests/avantiqo-intelligence-modal-only-convergence.test.mjs
  git diff --check

  node --test \
    tests/avantiqo-intelligence-modal-only-convergence.test.mjs \
    tests/avantiqo-intelligence-reasoning-loop-contract.test.mjs \
    tests/avantiqo-intelligence-safe-lease-provider-guard.test.mjs

  node scripts/avantiqo-learning-worldclass-phase4-audit.mjs

  if git grep -n -E 'api\.runpod\.ai|rest\.runpod\.io|AVANTIQO_RUNPOD_SAFE_LEASE' -- \
    lib/intelligence/runtime/AvantiqoMechanismFirstLearningRuntime.js \
    scripts/run-avantiqo-learning-mechanism-synthesis-modal-child-local.mjs \
    tests/avantiqo-intelligence-modal-only-convergence.test.mjs; then
    echo "${CONTRACT}_ACTIVE_LEARNING_RUNPOD_REFERENCE_FORBIDDEN" >&2
    false
  fi

  [[ ! -e scripts/run-avantiqo-learning-mechanism-synthesis-child-local.mjs ]] || {
    echo "${CONTRACT}_LEGACY_RUNPOD_CHILD_STILL_PRESENT" >&2
    false
  }

  changed="$(git diff --name-only | sort)"
  expected="$(printf '%s\n' \
    app/api/operator/turn/route.js \
    lib/intelligence/runtime/AvantiqoMechanismFirstLearningRuntime.js \
    lib/operator/runtime/OperatorReasoningRuntime.js \
    scripts/avantiqo-learning-worldclass-phase4-audit.mjs \
    scripts/run-avantiqo-learning-mechanism-synthesis-child-local.mjs \
    tests/avantiqo-intelligence-modal-only-convergence.test.mjs | sort)"
  [[ "$changed" == "$expected" ]] || {
    echo "${CONTRACT}_UNEXPECTED_CHANGED_FILES" >&2
    printf 'expected:\n%s\nactual:\n%s\n' "$expected" "$changed" >&2
    false
  }

  git config user.name "Avantiqo Intelligence Repair"
  git config user.email "avantiqo-intelligence-repair@local.invalid"
  git add -A \
    app/api/operator/turn/route.js \
    lib/intelligence/runtime/AvantiqoMechanismFirstLearningRuntime.js \
    lib/operator/runtime/OperatorReasoningRuntime.js \
    scripts/avantiqo-learning-worldclass-phase4-audit.mjs \
    scripts/run-avantiqo-learning-mechanism-synthesis-child-local.mjs \
    tests/avantiqo-intelligence-modal-only-convergence.test.mjs
  git commit -m "Converge Intelligence and Learning on governed Modal" >/dev/null
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
