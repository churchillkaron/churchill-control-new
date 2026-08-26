#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$NODE_MAJOR" != "24" ]]; then
  echo "SECRETARY_MEETING_LOCAL_NODE=FAIL"
  echo "SECRETARY_MEETING_LOCAL_NODE_REQUIRED=24.x"
  echo "SECRETARY_MEETING_LOCAL_NODE_ACTUAL=$(node --version)"
  echo "SECRETARY_MEETING_LOCAL_FAILURE=NODE_VERSION_MISMATCH"
  exit 1
fi

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

# The repository retains historical ERP migrations whose earliest canonical table
# baselines are already represented in production history and therefore cannot all
# be replayed from an empty database. Meeting Secretary certification must not fail
# on unrelated Finance history. Supply only the minimal test foundation needed by
# Secretary foreign keys, then replay the real Secretary migrations unchanged.
cp \
  "$ROOT/scripts/fixtures/secretary-meeting-local-foundation.sql" \
  "$WORKDIR/supabase/migrations/20260825000000_secretary_local_foundation.sql"

SECRETARY_MIGRATIONS=(
  "20260825062200_avantiqo_secretary_native_core.sql"
  "20260825150000_secretary_meeting_intelligence_and_jobs.sql"
  "20260825151000_secretary_job_execution_claim.sql"
  "20260826002000_secretary_prospect_discovery.sql"
  "20260826002500_secretary_job_response_collection.sql"
  "20260826003000_secretary_job_waiting_claim_semantics.sql"
  "20260826010000_secretary_meeting_audio_chunk_idempotency.sql"
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

# The repository root .env.local can contain application/provider configuration that
# the Supabase CLI does not need for this local schema certification. Running with a
# clean temporary --workdir prevents that file from being parsed or printed.
# config.toml references OPENAI_API_KEY for optional local Studio AI, so provide a
# harmless local placeholder only when the caller did not already export one.
export OPENAI_API_KEY="${OPENAI_API_KEY:-local-secretary-certification-disabled}"

echo "SECRETARY_MEETING_LOCAL_SUPABASE_WORKDIR_ISOLATED=true"
echo "SECRETARY_MEETING_LOCAL_MIGRATION_SCOPE=SECRETARY_ONLY"
echo "SECRETARY_MEETING_LOCAL_FOUNDATION_TEST_ONLY=true"
echo "SECRETARY_MEETING_REAL_MIGRATIONS_UNMODIFIED=true"
echo "SECRETARY_MEETING_ROOT_ENV_LOCAL_READ=false"
echo "SECRETARY_MEETING_ROOT_ENV_LOCAL_MUTATED=false"
echo "SECRETARY_MEETING_SECRETS_PRINTED=false"

START_LOG="$WORKDIR/supabase-start.log"
if ! supabase start --workdir "$WORKDIR" >"$START_LOG" 2>&1; then
  echo "SECRETARY_MEETING_LOCAL_SUPABASE_START=FAIL"
  grep -Ev '(ANON_KEY|SERVICE_ROLE_KEY|PUBLISHABLE|SECRET_KEY|JWT_SECRET|S3_|DB_URL|API key)' "$START_LOG" | tail -n 120 || true
  exit 1
fi

supabase db reset --local --workdir "$WORKDIR"

# Supabase CLI documents `status -o env` as the local connection export surface.
# Capture it without printing and expose only the local API URL + service-role key to
# Secretary local certification scripts.
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

npm run audit:operator-secretary-end-to-end
node scripts/preflight-secretary-meeting-local.mjs
node --import ./scripts/register-node-next-alias-hooks.mjs scripts/certify-secretary-job-approval-local.mjs

echo "SECRETARY_MEETING_LOCAL_CERTIFICATION_WRAPPER=PASS"
echo "SECRETARY_MEETING_LOCAL_SUPABASE_WORKDIR_ISOLATED=true"
echo "SECRETARY_MEETING_LOCAL_MIGRATION_SCOPE=SECRETARY_ONLY"
echo "SECRETARY_MEETING_ROOT_ENV_LOCAL_MUTATED=false"
echo "SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false"
