#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${AVANTIQO_REPO_ROOT:-$HOME/Projects/churchill-control-new}"
BRANCH="${AVANTIQO_CREATIVE_BRANCH:-agent/creative-universal-reality-repair-20260724}"
TARGET_ORGANIZATION_ID="${CREATIVE_TEST_ORGANIZATION_ID:-33336a72-acb5-474e-856b-8be0269360e2}"
MIGRATION_NAME="20260724145500_creative_project_duration_semantics.sql"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUTPUT_DIR="${CREATIVE_SMOKE_OUTPUT_DIR:-$HOME/Downloads/AVANTIQO_CREATIVE_LIVE_SMOKE_$STAMP}"
TEMP_ROOT="$(mktemp -d /tmp/avantiqo-creative-live-smoke.XXXXXX)"
WORKTREE="$TEMP_ROOT/repository"
SERVER_PID=""
PORT="${CREATIVE_SMOKE_PORT:-3017}"
MIGRATION_COPIED=0
mkdir -p "$OUTPUT_DIR"

cleanup() {
  local status=$?
  if [ -n "${SERVER_PID:-}" ]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  if [ "$MIGRATION_COPIED" -eq 1 ]; then
    rm -f "$REPO_ROOT/supabase/migrations/$MIGRATION_NAME"
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

postgrest_get() {
  local url="$1"
  local output_file="$2"
  local label="$3"
  local status

  status="$(
    curl -sS \
      -o "$output_file" \
      -w '%{http_code}' \
      "$url" \
      -H "apikey: $SERVICE_ROLE_KEY" \
      -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
      2>"$output_file.curl-error" || true
  )"

  if [ "$status" != "200" ]; then
    echo "$label request failed with HTTP $status"
    cat "$output_file" 2>/dev/null || true
    cat "$output_file.curl-error" 2>/dev/null || true
    fail "$label could not be read from Supabase"
  fi

  if ! jq -e 'type == "array"' "$output_file" >/dev/null 2>&1; then
    echo "$label returned an unexpected payload:"
    cat "$output_file" 2>/dev/null || true
    fail "$label response was not a JSON array"
  fi
}

run_supabase() {
  if command -v supabase >/dev/null 2>&1; then
    supabase "$@"
  else
    npx --yes supabase "$@"
  fi
}

apply_duration_migration() {
  local source_migration="$WORKTREE/supabase/migrations/$MIGRATION_NAME"
  local target_migration="$REPO_ROOT/supabase/migrations/$MIGRATION_NAME"
  local dry_run_log="$OUTPUT_DIR/supabase-duration-dry-run.log"
  local push_log="$OUTPUT_DIR/supabase-duration-push.log"
  local pending_file="$OUTPUT_DIR/pending-migrations.txt"

  [ -f "$source_migration" ] || fail "Required migration missing: $source_migration"

  if [ ! -f "$target_migration" ]; then
    cp "$source_migration" "$target_migration"
    MIGRATION_COPIED=1
  elif ! cmp -s "$source_migration" "$target_migration"; then
    fail "Local migration with the same version has different content: $target_migration"
  fi

  echo "Checking remote Creative duration migration..."

  set +e
  (
    cd "$REPO_ROOT" &&
    run_supabase db push --dry-run --include-all
  ) >"$dry_run_log" 2>&1
  local dry_status=$?
  set -e

  if [ "$dry_status" -ne 0 ]; then
    cat "$dry_run_log" || true
    fail "Supabase migration dry-run failed"
  fi

  grep -Eo '[0-9]{14}_[A-Za-z0-9_]+\.sql' "$dry_run_log" |
    sort -u > "$pending_file" || true

  if [ -s "$pending_file" ]; then
    local unrelated
    unrelated="$(grep -v "^$MIGRATION_NAME$" "$pending_file" || true)"
    if [ -n "$unrelated" ]; then
      echo "Unrelated pending migrations detected:"
      printf '%s\n' "$unrelated"
      fail "Refusing to push unrelated migrations"
    fi
  fi

  if grep -qx "$MIGRATION_NAME" "$pending_file"; then
    echo "Applying guarded Creative duration migration..."
    set +e
    (
      cd "$REPO_ROOT" &&
      run_supabase db push --include-all --yes
    ) >"$push_log" 2>&1
    local push_status=$?
    set -e

    if [ "$push_status" -ne 0 ]; then
      cat "$push_log" || true
      fail "Creative duration migration push failed"
    fi

    echo "Creative duration migration applied."
  else
    echo "Creative duration migration is already applied."
  fi
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

SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-${SUPABASE_URL:-}}"
SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
[ -n "$SUPABASE_URL" ] || fail "NEXT_PUBLIC_SUPABASE_URL is missing"
[ -n "$SERVICE_ROLE_KEY" ] || fail "SUPABASE_SERVICE_ROLE_KEY is missing"
SUPABASE_URL="${SUPABASE_URL%/}"

apply_duration_migration

ORGANIZATION_JSON="$OUTPUT_DIR/churchill-organization.json"
ENTITY_JSON="$OUTPUT_DIR/churchill-legal-entities.json"

echo "Validating Churchill organization and currency configuration..."
postgrest_get \
  "$SUPABASE_URL/rest/v1/organizations?id=eq.$TARGET_ORGANIZATION_ID&select=*" \
  "$ORGANIZATION_JSON" \
  "Churchill organization"

postgrest_get \
  "$SUPABASE_URL/rest/v1/legal_entities?organization_id=eq.$TARGET_ORGANIZATION_ID&select=organization_id,currency" \
  "$ENTITY_JSON" \
  "Churchill legal entities"

ORGANIZATION_NAME="$(
  jq -r '
    first(
      .[]?
      | objects
      | .name // .legal_name // .display_name // empty
    ) // empty
  ' "$ORGANIZATION_JSON"
)"
[ -n "$ORGANIZATION_NAME" ] || fail "Churchill organization was not found"

ORGANIZATION_CURRENCY="$(
  jq -r '
    first(
      .[]?
      | objects
      | .default_currency //
        .currency //
        .base_currency //
        .functional_currency //
        .metadata.currency //
        .settings.currency //
        empty
    ) // empty
  ' "$ORGANIZATION_JSON" |
    tr '[:lower:]' '[:upper:]'
)"
CURRENCY_SOURCE="organizations"

if ! printf '%s' "$ORGANIZATION_CURRENCY" | grep -Eq '^[A-Z]{3}$'; then
  ORGANIZATION_CURRENCY="$(
    jq -r '
      [
        .[]?
        | objects
        | .currency?
        | select(type == "string")
        | ascii_upcase
        | select(test("^[A-Z]{3}$"))
      ]
      | unique
      | if length == 1 then .[0] else empty end
    ' "$ENTITY_JSON"
  )"
  CURRENCY_SOURCE="legal_entities"
fi

[ -n "$ORGANIZATION_CURRENCY" ] || {
  echo "Churchill organization payload:"
  cat "$ORGANIZATION_JSON" || true
  echo
  echo "Churchill legal-entity payload:"
  cat "$ENTITY_JSON" || true
  echo
  fail "Churchill has no unambiguous organization or legal-entity currency"
}

WORKER_SECRET="${CREATIVE_TEST_WORKER_SECRET:-${CRON_SECRET:-${AVANTIQO_INTERNAL_WORKER_SECRET:-}}}"
if [ -z "$WORKER_SECRET" ]; then
  WORKER_SECRET="creative-smoke-$(command -v uuidgen >/dev/null 2>&1 && uuidgen || printf '%s-%s' "$(date +%s)" "$$")"
fi
export AVANTIQO_INTERNAL_WORKER_SECRET="$WORKER_SECRET"
export CRON_SECRET="$WORKER_SECRET"

while lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done
APP_URL="http://127.0.0.1:$PORT"

echo "Installing exact branch dependencies..."
npm ci > "$OUTPUT_DIR/npm-ci.log" 2>&1

echo "Starting isolated Creative Studio on port $PORT..."
npm run dev -- -p "$PORT" > "$OUTPUT_DIR/server.log" 2>&1 &
SERVER_PID=$!

READY=0
for _attempt in $(seq 1 120); do
  HTTP_STATUS="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' "$APP_URL" 2>/dev/null || true)"
  if [ -n "$HTTP_STATUS" ] && [ "$HTTP_STATUS" != "000" ]; then
    READY=1
    break
  fi
  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    tail -n 160 "$OUTPUT_DIR/server.log" || true
    fail "Creative Studio server stopped during startup"
  fi
  sleep 2
done
[ "$READY" -eq 1 ] || fail "Creative Studio did not become ready"

export CREATIVE_TEST_APP_URL="$APP_URL"
export CREATIVE_TEST_ORGANIZATION_ID="$TARGET_ORGANIZATION_ID"
export CREATIVE_TEST_AUTH_TOKEN="avantiqo-automatic-local-smoke"
export CREATIVE_TEST_WORKER_SECRET="$WORKER_SECRET"
export CREATIVE_TEST_MEDIUM="FILM"
export CREATIVE_TEST_MAX_POLLS="120"
export CREATIVE_TEST_POLL_SECONDS="10"
export CREATIVE_TEST_REPORT="$OUTPUT_DIR/creative-live-smoke-report.json"
export CREATIVE_TEST_REQUEST="Create a premium cinematic entrance-and-staff brand film for Churchill Restaurant & Bar. Begin outside the real venue and establish its entrance, location, architecture and atmosphere. Follow a natural guest arrival into the venue with clear spatial continuity. Introduce the real staff through purposeful service actions, authentic expressions, believable movement and warm human reactions. Use supplied and approved Churchill organization assets as visual truth and reference. Maintain consistent people, clothing, environment, lighting, geography and brand details across every shot. Include refined cinematic pacing, camera direction, transitions, sound design, music intention, restrained premium titles and a strong emotional ending. Produce the complete release-ready master film and supporting delivery package."

header "RUNNING REAL PROVIDER-BACKED PRODUCTION"
echo "ORGANIZATION_ID=$TARGET_ORGANIZATION_ID"
echo "ORGANIZATION=$ORGANIZATION_NAME"
echo "CURRENCY=$ORGANIZATION_CURRENCY"
echo "CURRENCY_SOURCE=$CURRENCY_SOURCE"
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
