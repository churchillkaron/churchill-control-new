#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${AVANTIQO_REPO_ROOT:-$HOME/Projects/churchill-control-new}"
BRANCH="${AVANTIQO_CREATIVE_BRANCH:-agent/creative-universal-reality-repair-20260724}"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUTPUT_DIR="${CREATIVE_SMOKE_OUTPUT_DIR:-$HOME/Downloads/AVANTIQO_CREATIVE_LIVE_SMOKE_$STAMP}"
TEMP_ROOT="$(mktemp -d /tmp/avantiqo-creative-live-smoke.XXXXXX)"
WORKTREE="$TEMP_ROOT/repository"
SERVER_PID=""
PORT="${CREATIVE_SMOKE_PORT:-3017}"
mkdir -p "$OUTPUT_DIR"

cleanup() {
  local status=$?
  if [ -n "${SERVER_PID:-}" ]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  cd "$REPO_ROOT" >/dev/null 2>&1 || true
  git worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  rm -rf "$TEMP_ROOT"
  return "$status"
}
trap cleanup EXIT INT TERM

fail() {
  echo "ERROR: $*"
  echo "REPORT DIRECTORY: $OUTPUT_DIR"
  exit 1
}

header() {
  echo
  echo "============================================================"
  echo "$*"
  echo "============================================================"
}

header "AVANTIQO CREATIVE LIVE ENTRANCE + STAFF SMOKE"
echo "Output: $OUTPUT_DIR"

for command_name in git node npm curl jq lsof; do
  command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is required"
done
[ -d "$REPO_ROOT/.git" ] || fail "Repository not found at $REPO_ROOT"
[ -f "$REPO_ROOT/.env.local" ] || fail "$REPO_ROOT/.env.local was not found"

cd "$REPO_ROOT"
echo "Fetching audited Creative branch..."
git fetch origin "$BRANCH" > "$OUTPUT_DIR/git-fetch.log" 2>&1
echo "Creating isolated temporary worktree..."
git worktree add --detach "$WORKTREE" "origin/$BRANCH" > "$OUTPUT_DIR/worktree.log" 2>&1

for env_file in .env .env.local .env.development .env.development.local; do
  [ -f "$REPO_ROOT/$env_file" ] && cp "$REPO_ROOT/$env_file" "$WORKTREE/$env_file"
done

cd "$WORKTREE"
set -a
for env_file in .env .env.local .env.development .env.development.local; do
  [ -f "$env_file" ] && source "$env_file"
done
set +a

export CREATIVE_SMOKE_OUTPUT_DIR="$OUTPUT_DIR"
DISCOVERY_JSON="$OUTPUT_DIR/organization-discovery.json"

echo "Discovering Creative organization and canonical currency evidence..."
node scripts/creative-currency-evidence-repair.js > "$DISCOVERY_JSON"

ORGANIZATION_ID="$(jq -r '.selected.organization_id // empty' "$DISCOVERY_JSON")"
ORGANIZATION_NAME="$(jq -r '.selected.organization_name // empty' "$DISCOVERY_JSON")"
ORGANIZATION_CURRENCY="$(jq -r '.selected.configured_currency // empty' "$DISCOVERY_JSON")"
CURRENCY_SOURCE="$(jq -r '.selected.currency_source // empty' "$DISCOVERY_JSON")"
REPAIR_ATTEMPTED="$(jq -r '.repair.attempted // false' "$DISCOVERY_JSON")"
REPAIR_SUCCESS="$(jq -r '.repair.success // false' "$DISCOVERY_JSON")"

[ -n "$ORGANIZATION_ID" ] || fail "No Creative organization had safe currency evidence. See $DISCOVERY_JSON"
[ -n "$ORGANIZATION_CURRENCY" ] || fail "Currency could not be configured safely. See $DISCOVERY_JSON"
if [ "$REPAIR_ATTEMPTED" = "true" ] && [ "$REPAIR_SUCCESS" != "true" ]; then
  fail "Canonical currency repair failed. See $DISCOVERY_JSON"
fi

WORKER_SECRET="${CREATIVE_TEST_WORKER_SECRET:-${CRON_SECRET:-${AVANTIQO_INTERNAL_WORKER_SECRET:-}}}"
if [ -z "$WORKER_SECRET" ]; then
  WORKER_SECRET="creative-smoke-$(command -v uuidgen >/dev/null 2>&1 && uuidgen || printf '%s-%s' "$(date +%s)" "$$")"
fi
export AVANTIQO_INTERNAL_WORKER_SECRET="$WORKER_SECRET"
export CRON_SECRET="$WORKER_SECRET"

while lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do PORT=$((PORT + 1)); done
APP_URL="http://127.0.0.1:$PORT"

echo "Installing exact branch dependencies..."
npm ci > "$OUTPUT_DIR/npm-ci.log" 2>&1

echo "Starting isolated Creative Studio on port $PORT..."
npm run dev -- -p "$PORT" > "$OUTPUT_DIR/server.log" 2>&1 &
SERVER_PID=$!

READY=0
for _attempt in $(seq 1 120); do
  HTTP_STATUS="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' "$APP_URL" 2>/dev/null || true)"
  if [ -n "$HTTP_STATUS" ] && [ "$HTTP_STATUS" != "000" ]; then READY=1; break; fi
  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    tail -n 160 "$OUTPUT_DIR/server.log" || true
    fail "Creative Studio server stopped during startup"
  fi
  sleep 2
done
[ "$READY" -eq 1 ] || fail "Creative Studio did not become ready"

export CREATIVE_TEST_APP_URL="$APP_URL"
export CREATIVE_TEST_ORGANIZATION_ID="$ORGANIZATION_ID"
export CREATIVE_TEST_AUTH_TOKEN="avantiqo-automatic-local-smoke"
export CREATIVE_TEST_WORKER_SECRET="$WORKER_SECRET"
export CREATIVE_TEST_MEDIUM="FILM"
export CREATIVE_TEST_MAX_POLLS="120"
export CREATIVE_TEST_POLL_SECONDS="10"
export CREATIVE_TEST_REPORT="$OUTPUT_DIR/creative-live-smoke-report.json"
export CREATIVE_TEST_REQUEST="Create a premium cinematic entrance-and-staff brand film. Begin outside the real venue and establish its entrance, location, architecture and atmosphere. Follow a natural guest arrival into the venue with clear spatial continuity. Introduce the real staff through purposeful service actions, authentic expressions, believable movement and warm human reactions. Use supplied and approved organization assets as visual truth and reference. Maintain consistent people, clothing, environment, lighting, geography and brand details across every shot. Include refined cinematic pacing, camera direction, transitions, sound design, music intention, restrained premium titles and a strong emotional ending. Produce the complete release-ready master film and supporting delivery package."

header "RUNNING REAL PROVIDER-BACKED PRODUCTION"
echo "ORGANIZATION_ID=$ORGANIZATION_ID"
[ -n "$ORGANIZATION_NAME" ] && echo "ORGANIZATION=$ORGANIZATION_NAME"
echo "CURRENCY=$ORGANIZATION_CURRENCY"
echo "CURRENCY_SOURCE=$CURRENCY_SOURCE"
echo "CURRENCY_REPAIR_ATTEMPTED=$REPAIR_ATTEMPTED"
echo "APP_URL=$APP_URL"

set +e
bash scripts/creative-end-to-end-smoke.sh 2>&1 | tee "$OUTPUT_DIR/live-smoke.log"
SMOKE_STATUS=${PIPESTATUS[0]}
set -e

if [ "$SMOKE_STATUS" -eq 0 ] && grep -q "CREATIVE_END_TO_END_SMOKE=PASS" "$OUTPUT_DIR/live-smoke.log"; then
  header "CREATIVE LIVE SMOKE PASSED"
  grep -E 'CREATIVE_END_TO_END_SMOKE=|MISSION_ID=|PROJECT_ID=|PROJECT_TYPE=|TASKS=|RELEASABLE_DELIVERABLES=' "$OUTPUT_DIR/live-smoke.log" || true
else
  header "CREATIVE LIVE SMOKE FAILED"
  tail -n 200 "$OUTPUT_DIR/live-smoke.log" || true
fi

echo
echo "REPORT DIRECTORY:"
echo "$OUTPUT_DIR"
echo
printf "Terminal will stay open. Copy the result, then press Enter..."
IFS= read -r _
exit "$SMOKE_STATUS"
