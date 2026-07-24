#!/usr/bin/env bash
set -u
set -o pipefail

ROOT="${1:-$(pwd)}"
EXPECTED_BRANCH="${CREATIVE_EXPECTED_BRANCH:-agent/creative-shot-production-convergence}"
REPORT="${CREATIVE_REALITY_REPORT:-$ROOT/creative-reality-gate-report.txt}"
FAILURES=0
WARNINGS=0

cd "$ROOT" || exit 1
: > "$REPORT"

log() {
  printf '%s\n' "$*" | tee -a "$REPORT"
}

pass() {
  log "PASS: $*"
}

warn() {
  WARNINGS=$((WARNINGS + 1))
  log "WARN: $*"
}

fail() {
  FAILURES=$((FAILURES + 1))
  log "FAIL: $*"
}

section() {
  log ""
  log "================ $* ================"
}

section "CREATIVE REALITY GATE"
log "ROOT=$ROOT"
log "DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)"

section "TOOLCHAIN"
for command_name in git node npm curl jq; do
  if command -v "$command_name" >/dev/null 2>&1; then
    pass "$command_name available"
  else
    fail "$command_name required"
  fi
done

if command -v gh >/dev/null 2>&1; then
  pass "gh available for optional PR inspection"
else
  warn "gh unavailable; local production validation continues without GitHub CLI"
fi

section "SOURCE STATE"
CURRENT_BRANCH="$(git branch --show-current 2>/dev/null || true)"
if [ -n "$CURRENT_BRANCH" ]; then
  log "BRANCH=$CURRENT_BRANCH"
  if [ "$CURRENT_BRANCH" = "$EXPECTED_BRANCH" ]; then
    pass "expected convergence branch checked out"
  else
    warn "running on $CURRENT_BRANCH instead of $EXPECTED_BRANCH"
  fi
else
  warn "detached HEAD or branch unavailable"
fi

git diff --check >> "$REPORT" 2>&1
if [ "$?" -eq 0 ]; then
  pass "git diff --check"
else
  fail "git diff --check"
fi

section "CANONICAL MIGRATIONS"
MIGRATIONS=(
  20260722033000_creative_autonomous_execution.sql
  20260722043000_creative_immutable_versions.sql
  20260722050000_creative_business_truth_snapshots.sql
  20260722050500_creative_business_truth_snapshot_conflict_key.sql
  20260722051000_creative_storage_private.sql
  20260722054500_creative_projects_canonical_storage.sql
  20260722060000_creative_projects_schema_convergence.sql
  20260722170000_wallet_reference_transition_integrity.sql
  20260722194500_creative_director_job_runtime.sql
)

for migration in "${MIGRATIONS[@]}"; do
  if [ -f "supabase/migrations/$migration" ]; then
    pass "$migration present"
  else
    fail "$migration missing"
  fi
done

section "LOCKFILE CONTRACT"
if node <<'NODE' >> "$REPORT" 2>&1
const packageJson = require('./package.json');
const lock = require('./package-lock.json');
const required = ['@fal-ai/client', 'ffmpeg-static'];
const root = lock.packages?.['']?.dependencies || {};
const missing = required.filter((name) => packageJson.dependencies?.[name] && !root[name]);
if (missing.length) {
  console.error(`LOCKFILE_MISSING_ROOT_DEPENDENCIES=${missing.join(',')}`);
  process.exit(1);
}
console.log('LOCKFILE_ROOT_DEPENDENCIES=PASS');
NODE
then
  pass "package-lock matches creative runtime dependencies"
else
  fail "package-lock is stale; run npm install --package-lock-only and commit it"
fi

section "STATIC ARCHITECTURE"
if grep -RIn --exclude-dir=node_modules --exclude-dir=.git \
  'CREATIVE_AI_DIRECTOR_FILM_DELIVERABLE_REQUIRED\|Churchill Cinematic Hero Film' \
  app/api/creative lib/creative components/creative >> "$REPORT" 2>&1; then
  fail "film-only or organization-specific creative hardcoding remains"
else
  pass "no film-only mission assertion or hardcoded Churchill film title"
fi

if grep -q 'CREATIVE_PRODUCTION_LIFECYCLE_V2_UNIVERSAL' \
  lib/creative/production/runtime/CreativeProductionLifecycleRuntime.js; then
  pass "universal lifecycle installed"
else
  fail "universal lifecycle missing"
fi

if grep -q 'universal_deliverable_v1' \
  lib/creative/production-graph/planner/ProductionGraphPlanner.js; then
  pass "deliverable-driven production graph installed"
else
  fail "deliverable-driven production graph missing"
fi

if grep -q 'Automatic after AI quality' \
  components/creative/ProductionStudio/actions/RunCreativePipelineButton.jsx; then
  pass "automatic and approval-gated release controls installed"
else
  fail "release-mode control missing"
fi

section "SYNTAX"
JS_FILES=(
  app/api/creative/missions/compose/route.js
  app/api/creative/director/execute/route.js
  lib/creative/intent/CreativeDeliverableContract.js
  lib/creative/production-graph/planner/ProductionGraphPlanner.js
  lib/creative/production/runtime/CreativeUniversalProductionRuntime.js
  lib/creative/production/runtime/CreativeProductionHandoffRuntime.js
  lib/creative/production/runtime/CreativeProductionLifecycleRuntime.js
  lib/creative/production/runtime/ProductionRuntime.js
  lib/creative/production/control/CreativeProductionControlRuntime.js
  lib/creative/worker/CreativeOrchestrationWorker.js
)

for file in "${JS_FILES[@]}"; do
  if node --check "$file" >> "$REPORT" 2>&1; then
    pass "node --check $file"
  else
    fail "node --check $file"
  fi
done

for file in scripts/creative-end-to-end-smoke.sh scripts/creative-reality-gate.sh; do
  if bash -n "$file" >> "$REPORT" 2>&1; then
    pass "bash -n $file"
  else
    fail "bash -n $file"
  fi
done

section "CLEAN INSTALL AND BUILD"
if [ "$FAILURES" -eq 0 ]; then
  if npm ci >> "$REPORT" 2>&1; then
    pass "npm ci"
  else
    fail "npm ci"
  fi
else
  warn "npm ci skipped until source and lockfile blockers are repaired"
fi

if [ "$FAILURES" -eq 0 ]; then
  if npm run build >> "$REPORT" 2>&1; then
    pass "production build"
  else
    fail "production build"
  fi
else
  warn "production build skipped because earlier gates failed"
fi

section "AUTONOMOUS WORKER CONTRACT"
if grep -q '/api/creative/worker/autonomous' vercel.json; then
  pass "Vercel autonomous worker cron registered"
else
  fail "Vercel autonomous worker cron missing"
fi

if [ -n "${CRON_SECRET:-${AVANTIQO_INTERNAL_WORKER_SECRET:-}}" ]; then
  pass "worker secret available in current environment"
else
  warn "worker secret not visible locally; verify CRON_SECRET or AVANTIQO_INTERNAL_WORKER_SECRET in Vercel"
fi

section "OPTIONAL LIVE END-TO-END SMOKE"
if [ -n "${CREATIVE_TEST_APP_URL:-}" ] && \
   [ -n "${CREATIVE_TEST_ORGANIZATION_ID:-}" ] && \
   { [ -n "${CREATIVE_TEST_AUTH_TOKEN:-}" ] || [ -n "${CREATIVE_TEST_COOKIE:-}" ]; } && \
   [ -n "${CREATIVE_TEST_WORKER_SECRET:-${CRON_SECRET:-${AVANTIQO_INTERNAL_WORKER_SECRET:-}}}" ]; then
  if scripts/creative-end-to-end-smoke.sh 2>&1 | tee -a "$REPORT"; then
    pass "live story-to-deliverable smoke"
  else
    fail "live story-to-deliverable smoke"
  fi
else
  warn "live smoke skipped; set app URL, organization, auth, and worker secret variables"
fi

section "RESULT"
log "FAILURES=$FAILURES"
log "WARNINGS=$WARNINGS"
log "REPORT=$REPORT"

if [ "$FAILURES" -gt 0 ]; then
  log "CREATIVE_REALITY_GATE=FAIL"
  exit 1
fi

log "CREATIVE_REALITY_GATE=PASS"
exit 0
