#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

INITIAL_NODE_VERSION="$(node --version 2>/dev/null || echo unavailable)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
NODE_AUTO_SELECTED=false

if [[ "$NODE_MAJOR" != "24" ]]; then
  NODE24_BIN=""

  for candidate in \
    "$HOME"/.nvm/versions/node/v24*/bin \
    "$HOME"/.local/share/fnm/node-versions/v24*/installation/bin \
    "$HOME"/.local/share/mise/installs/node/24*/bin \
    "$HOME"/.asdf/installs/nodejs/24*/bin \
    "$HOME"/.volta/tools/image/node/24*/bin \
    /opt/homebrew/opt/node@24/bin \
    /usr/local/opt/node@24/bin \
    /opt/homebrew/Cellar/node@24/*/bin \
    /usr/local/Cellar/node@24/*/bin \
    /usr/local/n/versions/node/24*/bin; do
    if [[ ! -x "$candidate/node" ]]; then
      continue
    fi
    candidate_major="$("$candidate/node" -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
    if [[ "$candidate_major" == "24" ]]; then
      NODE24_BIN="$candidate"
      break
    fi
  done

  if [[ -n "$NODE24_BIN" ]]; then
    export PATH="$NODE24_BIN:$PATH"
    hash -r
    NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
    NODE_AUTO_SELECTED=true
  fi
fi

if [[ "$NODE_MAJOR" != "24" ]]; then
  echo "SECRETARY_MEETING_LOCAL_NODE=FAIL"
  echo "SECRETARY_MEETING_LOCAL_NODE_REQUIRED=24.x"
  echo "SECRETARY_MEETING_LOCAL_NODE_INITIAL=$INITIAL_NODE_VERSION"
  echo "SECRETARY_MEETING_LOCAL_NODE_ACTUAL=$(node --version 2>/dev/null || echo unavailable)"
  echo "SECRETARY_MEETING_LOCAL_NODE_AUTO_SELECTED=false"
  echo "SECRETARY_MEETING_LOCAL_FAILURE=NODE_VERSION_MISMATCH"
  exit 1
fi

echo "SECRETARY_MEETING_LOCAL_NODE=PASS"
echo "SECRETARY_MEETING_LOCAL_NODE_REQUIRED=24.x"
echo "SECRETARY_MEETING_LOCAL_NODE_INITIAL=$INITIAL_NODE_VERSION"
echo "SECRETARY_MEETING_LOCAL_NODE_ACTUAL=$(node --version)"
echo "SECRETARY_MEETING_LOCAL_NODE_AUTO_SELECTED=$NODE_AUTO_SELECTED"

if ! command -v supabase >/dev/null 2>&1; then
  echo "SECRETARY_MEETING_LOCAL_SUPABASE_CLI=FAIL"
  echo "SECRETARY_MEETING_LOCAL_FAILURE=SUPABASE_CLI_NOT_FOUND"
  exit 1
fi

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/avantiqo-secretary-supabase.XXXXXX")"
cleanup() {
  supabase stop --workdir "$WORKDIR" >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT INT TERM

mkdir -p "$WORKDIR/supabase/migrations"
ln -s "$ROOT/supabase/config.toml" "$WORKDIR/supabase/config.toml"
: > "$WORKDIR/supabase/seed.sql"
if [[ -f "$ROOT/supabase/roles.sql" ]]; then
  ln -s "$ROOT/supabase/roles.sql" "$WORKDIR/supabase/roles.sql"
fi

cp \
  "$ROOT/scripts/fixtures/secretary-meeting-local-foundation.sql" \
  "$WORKDIR/supabase/migrations/20260825000000_secretary_local_foundation.sql"

SECRETARY_MIGRATIONS=(
  "20260825062200_avantiqo_secretary_native_core.sql"
  "20260825063300_avantiqo_secretary_call_sessions.sql"
  "20260825063900_avantiqo_secretary_atomic_booking.sql"
  "20260825064100_avantiqo_secretary_outbound_calls.sql"
  "20260825065700_avantiqo_secretary_message_reception.sql"
  "20260825073300_secretary_follow_up_execution.sql"
  "20260825150000_secretary_meeting_intelligence_and_jobs.sql"
  "20260825151000_secretary_job_execution_claim.sql"
  "20260826002000_secretary_prospect_discovery.sql"
  "20260826002500_secretary_job_response_collection.sql"
  "20260826003000_secretary_job_waiting_claim_semantics.sql"
  "20260826010000_secretary_meeting_audio_chunk_idempotency.sql"
  "20260826102000_secretary_multi_party_meeting_coordination.sql"
  "20260826190000_secretary_booked_meeting_changes.sql"
  "20260826193000_secretary_recurring_meetings.sql"
  "20260826194000_secretary_recurring_future_cutoff_semantics.sql"
)

for migration in "${SECRETARY_MIGRATIONS[@]}"; do
  source_path="$ROOT/supabase/migrations/$migration"
  if [[ ! -f "$source_path" ]]; then
    echo "SECRETARY_MEETING_LOCAL_MIGRATION_SCOPE=FAIL"
    echo "SECRETARY_MEETING_LOCAL_FAILURE=MISSING_SECRETARY_MIGRATION:$migration"
    exit 1
  fi
  ln -s "$source_path" "$WORKDIR/supabase/migrations/$migration"
done

export OPENAI_API_KEY="${OPENAI_API_KEY:-local-secretary-certification-disabled}"

echo "SECRETARY_MEETING_LOCAL_SUPABASE_WORKDIR_ISOLATED=true"
echo "SECRETARY_MEETING_LOCAL_MIGRATION_SCOPE=SECRETARY_ONLY"
echo "SECRETARY_MEETING_LOCAL_FOUNDATION_TEST_ONLY=true"
echo "SECRETARY_MEETING_REAL_MIGRATIONS_UNMODIFIED=true"
echo "SECRETARY_MEETING_ROOT_ENV_LOCAL_READ=false"
echo "SECRETARY_MEETING_ROOT_ENV_LOCAL_MUTATED=false"
echo "SECRETARY_MEETING_SECRETS_PRINTED=false"
echo "SECRETARY_MEETING_LOCAL_OPTIONAL_SERVICES_EXCLUDED=realtime,storage-api,studio,logflare,vector"

START_LOG="$WORKDIR/supabase-start.log"
if ! supabase start --workdir "$WORKDIR" -x realtime,storage-api,studio,logflare,vector >"$START_LOG" 2>&1; then
  echo "SECRETARY_MEETING_LOCAL_SUPABASE_START=FAIL"
  grep -Ev '(ANON_KEY|SERVICE_ROLE_KEY|PUBLISHABLE|SECRET_KEY|JWT_SECRET|S3_|DB_URL|API key)' "$START_LOG" | tail -n 120 || true
  exit 1
fi

supabase db reset --local --workdir "$WORKDIR"

STATUS_ENV="$(supabase status -o env --workdir "$WORKDIR" 2>/dev/null)"
eval "$STATUS_ENV"
LOCAL_API_URL="${API_URL:-${SUPABASE_URL:-}}"
LOCAL_SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY:-${SUPABASE_SERVICE_ROLE_KEY:-}}"
if [[ -z "$LOCAL_API_URL" || -z "$LOCAL_SERVICE_ROLE_KEY" ]]; then
  echo "SECRETARY_MEETING_LOCAL_CREDENTIAL_DISCOVERY=FAIL"
  echo "SECRETARY_MEETING_LOCAL_FAILURE=LOCAL_SUPABASE_STATUS_ENV_INCOMPLETE"
  exit 1
fi
export NEXT_PUBLIC_SUPABASE_URL="$LOCAL_API_URL"
export SUPABASE_SERVICE_ROLE_KEY="$LOCAL_SERVICE_ROLE_KEY"

echo "SECRETARY_MEETING_LOCAL_CREDENTIAL_DISCOVERY=PASS"
echo "SECRETARY_MEETING_LOCAL_CREDENTIALS_PRINTED=false"

node scripts/operator-secretary-supabase-await-audit.mjs
npm run audit:operator-secretary-end-to-end
node scripts/preflight-secretary-meeting-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-job-approval-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-approval-owner-boundary-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-job-review-controls-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-job-cancellation-normalization-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-correspondence-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-inbox-triage-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-inbox-coverage-routing-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-job-follow-through-cancellation-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-travel-coordination-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-meeting-coordination-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-meeting-booking-notifications-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-meeting-call-clarification-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-meeting-slot-optimization-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-meeting-candidate-generation-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-booked-meeting-changes-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-recurring-meetings-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-meeting-agenda-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-visitor-coordination-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-expense-pack-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-document-filing-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-relationship-memory-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-deadline-coordination-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-absence-coverage-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-call-screening-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-call-screening-coverage-routing-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-executive-briefing-v4-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-executive-briefing-v5-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-executive-briefing-v6-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-executive-briefing-v7-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-coverage-routing-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-administrative-coverage-routing-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-job-coverage-execution-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-commitment-control-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-decision-register-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-directive-register-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-directive-follow-through-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-calendar-stewardship-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-mail-courier-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-meeting-closeout-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-meeting-minutes-revision-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-staff-delegation-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-working-preferences-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-travel-operations-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-travel-cancellation-local.mjs

echo "SECRETARY_MEETING_LOCAL_CERTIFICATION_WRAPPER=PASS"
echo "SECRETARY_MEETING_LOCAL_SUPABASE_WORKDIR_ISOLATED=true"
echo "SECRETARY_MEETING_LOCAL_MIGRATION_SCOPE=SECRETARY_ONLY"
echo "SECRETARY_MEETING_ROOT_ENV_LOCAL_MUTATED=false"
echo "SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false"
