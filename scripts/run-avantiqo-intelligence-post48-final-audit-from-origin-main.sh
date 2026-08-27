#!/usr/bin/env bash
set -eu

ROOT="${AVANTIQO_PROJECT_ROOT:-$HOME/Projects/churchill-control-new}"
TMP_PARENT="${TMPDIR:-/tmp}"
WT=""
cleanup() {
  if [ -n "$WT" ] && [ -d "$WT" ]; then git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT INT TERM

cd "$ROOT"
git fetch origin main
SOURCE_SHA="$(git rev-parse origin/main)"
WT="$(mktemp -d "$TMP_PARENT/avantiqo-intelligence-final-audit.XXXXXX")"
rmdir "$WT"
git worktree add --detach "$WT" "$SOURCE_SHA"
if [ -d "$ROOT/node_modules" ]; then ln -s "$ROOT/node_modules" "$WT/node_modules"; fi

cd "$WT"
echo "AVANTIQO_INTELLIGENCE_FINAL_AUDIT_SOURCE_SHA=$SOURCE_SHA"
echo "AVANTIQO_INTELLIGENCE_FINAL_AUDIT_DETACHED=true"
node scripts/avantiqo-learning-worldclass-phase48-audit.mjs
node scripts/avantiqo-intelligence-post48-gap-repair-audit.mjs
node scripts/avantiqo-intelligence-production-adapter-release-audit.mjs

echo "AVANTIQO_INTELLIGENCE_POST48_FINAL_DETACHED_AUDIT=PASS"
echo "AVANTIQO_INTELLIGENCE_PHASE49_CREATED=false"
echo "AVANTIQO_INTELLIGENCE_PROVIDER_JOB_SUBMITTED=NO"
echo "AVANTIQO_INTELLIGENCE_INFERENCE_PERFORMED=NO"
echo "AVANTIQO_INTELLIGENCE_RUNPOD_MUTATION_PERFORMED=NO"
echo "AVANTIQO_INTELLIGENCE_PRODUCTION_PROMOTION_PERFORMED=NO"
echo "Terminal remains open."
