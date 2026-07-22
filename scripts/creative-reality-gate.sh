#!/usr/bin/env bash
set -u
set -o pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT" || exit 1

STAMP="$(date +%Y%m%d_%H%M%S)"
REPORT="${CREATIVE_REALITY_REPORT:-$ROOT/creative-reality-gate-$STAMP.txt}"
EXPECTED_BRANCH="${CREATIVE_REALITY_BRANCH:-agent/creative-shot-production-convergence}"
PR_NUMBER="${CREATIVE_REALITY_PR:-1}"
REPO="${CREATIVE_REALITY_REPO:-churchillkaron/churchill-control-new}"
APP_URL="${CREATIVE_REALITY_APP_URL:-http://localhost:3000}"
FAILURES=0
WARNINGS=0

exec > >(tee "$REPORT") 2>&1

section() {
  printf '\n============================================================\n'
  printf '%s\n' "$1"
  printf '============================================================\n'
}

pass() {
  printf 'PASS: %s\n' "$1"
}

warn() {
  WARNINGS=$((WARNINGS + 1))
  printf 'WARN: %s\n' "$1"
}

fail() {
  FAILURES=$((FAILURES + 1))
  printf 'FAIL: %s\n' "$1"
}

require_command() {
  if command -v "$1" >/dev/null 2>&1; then
    pass "$1 available"
  else
    fail "$1 is required"
  fi
}

section "AVANTIQO CREATIVE STUDIO REALITY GATE"
printf 'Repository: %s\n' "$ROOT"
printf 'Expected branch: %s\n' "$EXPECTED_BRANCH"
printf 'Report: %s\n' "$REPORT"
printf 'Started: %s\n' "$(date -Iseconds)"

section "TOOLCHAIN"
require_command git
require_command node
require_command npm
require_command gh

if command -v node >/dev/null 2>&1; then
  printf 'Node: %s\n' "$(node --version)"
fi
if command -v npm >/dev/null 2>&1; then
  printf 'npm: %s\n' "$(npm --version)"
fi
if command -v gh >/dev/null 2>&1; then
  if gh auth status >/dev/null 2>&1; then
    pass "GitHub CLI authenticated"
  else
    fail "GitHub CLI is not authenticated"
  fi
fi

section "GIT REALITY"
CURRENT_BRANCH="$(git branch --show-current 2>/dev/null || true)"
printf 'Current branch: %s\n' "$CURRENT_BRANCH"

if [ "$CURRENT_BRANCH" = "$EXPECTED_BRANCH" ]; then
  pass "correct Creative convergence branch"
else
  fail "expected branch $EXPECTED_BRANCH but found ${CURRENT_BRANCH:-detached}"
fi

if git diff --check; then
  pass "git diff --check"
else
  fail "git diff contains whitespace or conflict errors"
fi

if [ -n "$(git status --porcelain)" ]; then
  warn "working tree is not clean"
  git status --short
else
  pass "working tree clean"
fi

if git fetch origin "$EXPECTED_BRANCH" --quiet; then
  LOCAL_HEAD="$(git rev-parse HEAD)"
  REMOTE_HEAD="$(git rev-parse "origin/$EXPECTED_BRANCH")"
  printf 'Local head:  %s\n' "$LOCAL_HEAD"
  printf 'Remote head: %s\n' "$REMOTE_HEAD"
  if [ "$LOCAL_HEAD" = "$REMOTE_HEAD" ]; then
    pass "local branch matches origin"
  else
    fail "local branch does not match origin"
  fi
else
  fail "unable to fetch origin branch"
fi

section "PULL REQUEST CHECKS"
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  gh pr view "$PR_NUMBER" --repo "$REPO" \
    --json number,state,isDraft,mergeable,headRefName,headRefOid,title,url || \
    fail "unable to read PR metadata"

  if gh pr checks "$PR_NUMBER" --repo "$REPO" --watch=false; then
    pass "PR checks successful"
  else
    fail "PR checks pending or failing"
  fi
fi

section "DEPENDENCY LOCK REALITY"
if [ ! -f package.json ]; then
  fail "package.json missing"
elif [ ! -f package-lock.json ]; then
  fail "package-lock.json missing"
else
  LOCK_DRIFT="$(node <<'NODE'
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const root = lock.packages?.[''] || {};
const groups = ['dependencies', 'devDependencies', 'optionalDependencies'];
const issues = [];
for (const group of groups) {
  const wanted = pkg[group] || {};
  const locked = root[group] || {};
  for (const [name, version] of Object.entries(wanted)) {
    if (locked[name] !== version) {
      issues.push(`${group}:${name}:package=${version}:lock=${locked[name] || 'MISSING'}`);
    }
  }
  for (const name of Object.keys(locked)) {
    if (!(name in wanted)) {
      issues.push(`${group}:${name}:LOCK_ONLY`);
    }
  }
}
process.stdout.write(issues.join('\n'));
NODE
)"

  if [ -n "$LOCK_DRIFT" ]; then
    printf '%s\n' "$LOCK_DRIFT"
    warn "package-lock root manifest is stale; regenerating canonically"
    if npm install --package-lock-only --ignore-scripts --no-audit --no-fund; then
      pass "package-lock regenerated"
    else
      fail "package-lock regeneration failed"
    fi
  else
    pass "package.json and package-lock root manifests match"
  fi
fi

section "CLEAN INSTALL"
rm -rf node_modules .next
if npm ci --no-audit --no-fund; then
  pass "npm ci"
else
  fail "npm ci failed"
fi

section "PRODUCTION BUILD"
if npm run build; then
  pass "Next.js production build"
else
  fail "production build failed"
fi

section "CREATIVE MIGRATIONS"
MIGRATIONS=(
  "20260722033000_creative_autonomous_execution.sql"
  "20260722043000_creative_immutable_versions.sql"
  "20260722050000_creative_business_truth_snapshots.sql"
  "20260722050500_creative_business_truth_snapshot_conflict_key.sql"
  "20260722051000_creative_storage_private.sql"
)

for migration in "${MIGRATIONS[@]}"; do
  if [ -f "supabase/migrations/$migration" ]; then
    pass "$migration present"
  else
    fail "$migration missing"
  fi
done

if command -v supabase >/dev/null 2>&1; then
  pass "Supabase CLI available"
  if supabase migration list; then
    pass "Supabase migration history readable"
  else
    fail "Supabase migration history unavailable"
  fi

  if [ "${APPLY_CREATIVE_MIGRATIONS:-0}" = "1" ]; then
    if supabase db push; then
      pass "Supabase migrations applied"
    else
      fail "Supabase db push failed"
    fi
  else
    warn "migrations not pushed; set APPLY_CREATIVE_MIGRATIONS=1 to apply"
  fi
else
  warn "Supabase CLI unavailable; migration execution skipped"
fi

section "RUNTIME CONFIGURATION"
if [ -n "${CRON_SECRET:-}" ] || [ -n "${AVANTIQO_INTERNAL_WORKER_SECRET:-}" ]; then
  pass "autonomous worker secret configured in shell"
else
  warn "worker secret not visible locally; verify CRON_SECRET or AVANTIQO_INTERNAL_WORKER_SECRET in Vercel"
fi

if grep -q '"path": "/api/creative/worker/autonomous"' vercel.json && \
   grep -q '"schedule": "\* \* \* \* \*"' vercel.json; then
  pass "autonomous worker cron registered"
else
  fail "autonomous worker cron missing or changed"
fi

if grep -q "'creative-assets'" supabase/migrations/20260722051000_creative_storage_private.sql && \
   grep -q 'public = false' supabase/migrations/20260722051000_creative_storage_private.sql; then
  pass "private Creative Storage migration present"
else
  fail "private Creative Storage migration contract missing"
fi

section "OPTIONAL LIVE MISSION SMOKE"
if [ -n "${CREATIVE_TEST_ORGANIZATION_ID:-}" ]; then
  MISSION_PAYLOAD="$(node <<'NODE'
const payload = {
  organization_id: process.env.CREATIVE_TEST_ORGANIZATION_ID,
  entity_id: process.env.CREATIVE_TEST_ENTITY_ID || null,
  period_id: process.env.CREATIVE_TEST_PERIOD_ID || null,
  request: process.env.CREATIVE_TEST_REQUEST ||
    'Create a world-class, original multi-channel campaign using our real organization profile, locations and approved assets. Return a production-ready mission with one film and channel cutdowns.',
};
process.stdout.write(JSON.stringify(payload));
NODE
)"

  AUTH_ARGS=()
  if [ -n "${CREATIVE_TEST_BEARER_TOKEN:-}" ]; then
    AUTH_ARGS=(-H "Authorization: Bearer ${CREATIVE_TEST_BEARER_TOKEN}")
  fi

  HTTP_FILE="$(mktemp)"
  HTTP_STATUS="$(curl -sS -o "$HTTP_FILE" -w '%{http_code}' \
    -X POST "$APP_URL/api/creative/missions/compose" \
    -H 'Content-Type: application/json' \
    "${AUTH_ARGS[@]}" \
    --data "$MISSION_PAYLOAD" || true)"

  cat "$HTTP_FILE"
  printf '\nHTTP status: %s\n' "$HTTP_STATUS"

  if [ "$HTTP_STATUS" = "200" ] && node - "$HTTP_FILE" <<'NODE'
const fs = require('fs');
const body = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!body.success) process.exit(1);
if (!body.mission?.id) process.exit(2);
if (!body.blueprint?.deliverables?.length) process.exit(3);
if (!body.business_truth?.snapshot_id) process.exit(4);
if (!body.business_truth?.payload_hash) process.exit(5);
NODE
  then
    pass "live organization-scoped mission composition"
  else
    fail "live mission composition failed"
  fi
  rm -f "$HTTP_FILE"
else
  warn "live mission smoke skipped; set CREATIVE_TEST_ORGANIZATION_ID"
fi

section "RESULT"
printf 'Failures: %s\n' "$FAILURES"
printf 'Warnings: %s\n' "$WARNINGS"
printf 'Finished: %s\n' "$(date -Iseconds)"
printf 'Report: %s\n' "$REPORT"

if [ "$FAILURES" -gt 0 ]; then
  printf 'CREATIVE_REALITY_GATE=FAIL\n'
  exit 1
fi

printf 'CREATIVE_REALITY_GATE=PASS\n'
exit 0
