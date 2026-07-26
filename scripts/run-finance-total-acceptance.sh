#!/usr/bin/env bash

set -u

PROJECT_ROOT="${AVANTIQO_PROJECT_ROOT:-$HOME/Projects/churchill-control-new}"
BASE_URL="http://127.0.0.1:3000"
STAMP="$(date +%Y%m%d_%H%M%S)"
SESSION_FILE="$(mktemp)"
BOOTSTRAP_FILE="$(mktemp)"
DRY_LOG="$(mktemp)"
REPORT="/tmp/AVANTIQO_FINANCE_TOTAL_ACCEPTANCE_${STAMP}.json"
CREATIVE_HOLD_DIR="/tmp/avantiqo-finance-acceptance-creative-${STAMP}-$$"
CREATIVE_MIGRATIONS=(
  "$PROJECT_ROOT/supabase/migrations/20260725181500_creative_project_contract_convergence.sql"
  "$PROJECT_ROOT/supabase/migrations/20260726093000_creative_project_contract_hardening.sql"
)
QUARANTINED_CREATIVE_FILES=()

restore_creative_migrations() {
  local restored=0
  local held
  local destination

  for held in "${QUARANTINED_CREATIVE_FILES[@]}"; do
    [ -f "$held" ] || continue
    destination="$PROJECT_ROOT/supabase/migrations/$(basename "$held")"
    mkdir -p "$(dirname "$destination")"
    mv "$held" "$destination"
    restored=$((restored + 1))
  done

  QUARANTINED_CREATIVE_FILES=()
  rmdir "$CREATIVE_HOLD_DIR" 2>/dev/null || true

  if [ "$restored" -gt 0 ]; then
    echo "CREATIVE_MIGRATIONS_RESTORED=$restored"
  fi
}

cleanup() {
  restore_creative_migrations
  rm -f "$SESSION_FILE" "$BOOTSTRAP_FILE" "$DRY_LOG"
  unset FINANCE_SMOKE_PASSWORD FINANCE_ACCEPTANCE_ACCESS_TOKEN FINANCE_ACCEPTANCE_COOKIE 2>/dev/null || true
}
trap cleanup EXIT INT TERM

fail() {
  echo ""
  echo "FAILED: $1"
  echo "REPORT=$REPORT"
  echo ""
  printf "Terminal will stay open. Press Enter when finished..."
  IFS= read -r _
  exit 1
}

read_env_value() {
  node - "$1" <<'NODE'
const fs = require("fs");
const key = process.argv[2];
const values = {};
for (const filename of [".env", ".env.local"]) {
  if (!fs.existsSync(filename)) continue;
  for (const raw of fs.readFileSync(filename, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const index = normalized.indexOf("=");
    if (index < 1) continue;
    const name = normalized.slice(0, index).trim();
    let value = normalized.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[name] = value;
  }
}
process.stdout.write(String(values[key] || ""));
NODE
}

json_value() {
  node - "$1" "$2" <<'NODE'
const fs = require("fs");
const data = JSON.parse(fs.readFileSync(process.argv[2], "utf8") || "{}");
const value = process.argv[3].split(".").filter(Boolean).reduce((current, part) => current?.[part], data);
if (value !== undefined && value !== null) process.stdout.write(String(value));
NODE
}

echo "============================================================"
echo "AVANTIQO FINANCE TOTAL ACCEPTANCE"
echo "============================================================"
echo "Project: $PROJECT_ROOT"
echo "Report:  $REPORT"
echo ""

cd "$PROJECT_ROOT" || fail "Project directory not found"
command -v node >/dev/null 2>&1 || fail "Node.js is missing"
command -v curl >/dev/null 2>&1 || fail "curl is missing"

if [ -n "$(git status --porcelain)" ]; then
  git status --short
  fail "Working tree must be clean before total acceptance"
fi

echo "================ SYNC MAIN ================"
git fetch origin || fail "git fetch failed"
git switch main || fail "Cannot switch to main"
git pull --ff-only origin main || fail "Cannot fast-forward main"
echo "MAIN=$(git rev-parse HEAD)"

[ -f supabase/migrations/20260726100000_finance_total_acceptance_probe.sql ] || fail "Acceptance migration is missing"
[ -f scripts/finance-total-acceptance.mjs ] || fail "Acceptance orchestrator is missing"
[ -f scripts/create-finance-smoke-session.mjs ] || fail "Session helper is missing"

SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-$(read_env_value NEXT_PUBLIC_SUPABASE_URL)}"
ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-$(read_env_value NEXT_PUBLIC_SUPABASE_ANON_KEY)}"
SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$(read_env_value SUPABASE_SERVICE_ROLE_KEY)}"
if [ -z "$SERVICE_ROLE_KEY" ]; then SERVICE_ROLE_KEY="$(read_env_value SUPABASE_SERVICE_KEY)"; fi
if [ -z "$SERVICE_ROLE_KEY" ]; then SERVICE_ROLE_KEY="$(read_env_value SUPABASE_ADMIN_KEY)"; fi

[ -n "$SUPABASE_URL" ] || fail "NEXT_PUBLIC_SUPABASE_URL missing"
[ -n "$ANON_KEY" ] || fail "NEXT_PUBLIC_SUPABASE_ANON_KEY missing"
[ -n "$SERVICE_ROLE_KEY" ] || fail "SUPABASE_SERVICE_ROLE_KEY missing"

export NEXT_PUBLIC_SUPABASE_URL="$SUPABASE_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"

echo ""
echo "================ ISOLATE UNRELATED CREATIVE MIGRATIONS ================"
mkdir -p "$CREATIVE_HOLD_DIR" || fail "Could not create Creative migration hold directory"

for migration in "${CREATIVE_MIGRATIONS[@]}"; do
  if [ -f "$migration" ]; then
    held="$CREATIVE_HOLD_DIR/$(basename "$migration")"
    mv "$migration" "$held" || fail "Could not quarantine $(basename "$migration")"
    QUARANTINED_CREATIVE_FILES+=("$held")
    echo "CREATIVE_MIGRATION_QUARANTINED=$(basename "$migration")"
  fi
done

echo "CREATIVE_MIGRATIONS_QUARANTINED=${#QUARANTINED_CREATIVE_FILES[@]}"

echo ""
echo "================ ACCEPTANCE MIGRATION DRY RUN ================"
npx supabase db push --dry-run 2>&1 | tee "$DRY_LOG"
DRY_STATUS=${PIPESTATUS[0]}
if [ "$DRY_STATUS" -ne 0 ]; then
  fail "Acceptance migration dry run failed"
fi

if grep -q "Remote database is up to date" "$DRY_LOG"; then
  echo "Acceptance probe is already deployed."
elif grep -q "20260726100000_finance_total_acceptance_probe.sql" "$DRY_LOG"; then
  UNEXPECTED_VERSIONS="$(grep -Eo '[0-9]{14}' "$DRY_LOG" | sort -u | grep -v '^20260726100000$' || true)"
  if [ -n "$UNEXPECTED_VERSIONS" ]; then
    echo "$UNEXPECTED_VERSIONS"
    fail "Unexpected pending migrations detected"
  fi

  echo ""
  printf "Press Enter to deploy the rollback-safe acceptance probe, or Control-C to stop..."
  IFS= read -r _

  npx supabase db push --yes || fail "Acceptance migration deployment failed"
else
  fail "Dry run did not show the expected acceptance migration"
fi

restore_creative_migrations

for migration in "${CREATIVE_MIGRATIONS[@]}"; do
  if [ ! -f "$migration" ]; then
    fail "Creative migration was not restored: $(basename "$migration")"
  fi
done

echo ""
echo "================ LOCALHOST 3000 ================"
STATUS="$(curl --silent --max-time 5 --output /dev/null --write-out '%{http_code}' "$BASE_URL" 2>/dev/null || true)"
if [ "$STATUS" = "000" ] || [ -z "$STATUS" ]; then
  fail "localhost:3000 is not running. Start it with npm run dev first."
fi
echo "LOCALHOST_STATUS=$STATUS"

echo ""
echo "================ AUTHENTICATE ================"
printf "Avantiqo login email: "
IFS= read -r FINANCE_SMOKE_EMAIL
printf "Avantiqo login password: "
IFS= read -r -s FINANCE_SMOKE_PASSWORD
echo ""
export FINANCE_SMOKE_EMAIL FINANCE_SMOKE_PASSWORD

node scripts/create-finance-smoke-session.mjs > "$SESSION_FILE" || fail "Authentication failed"
ACCESS_TOKEN="$(json_value "$SESSION_FILE" accessToken)"
COOKIE_HEADER="$(json_value "$SESSION_FILE" cookieHeader)"
ACTOR_ID="$(json_value "$SESSION_FILE" userId)"
USER_EMAIL="$(json_value "$SESSION_FILE" userEmail)"
[ -n "$ACCESS_TOKEN" ] || fail "No access token returned"
[ -n "$COOKIE_HEADER" ] || fail "No session cookie returned"
[ -n "$ACTOR_ID" ] || fail "No authenticated user returned"
echo "AUTHENTICATED_USER=$USER_EMAIL"

USER_PAYLOAD="$(USER_ID="$ACTOR_ID" node <<'NODE'
process.stdout.write(JSON.stringify({ user_id: process.env.USER_ID }));
NODE
)"
BOOTSTRAP_STATUS="$({
  printf '%s' "$USER_PAYLOAD" |
    curl --silent --show-error --output "$BOOTSTRAP_FILE" --write-out '%{http_code}' \
      --request POST --header "Content-Type: application/json" --header "Cookie: $COOKIE_HEADER" \
      --data-binary @- "$BASE_URL/api/session/bootstrap"
})"
if [ "$BOOTSTRAP_STATUS" != "200" ]; then
  cat "$BOOTSTRAP_FILE"
  fail "Business context bootstrap failed"
fi

ORGANIZATION_ID="$(json_value "$BOOTSTRAP_FILE" organization_id)"
ENTITY_ID="$(json_value "$BOOTSTRAP_FILE" entity_id)"
ENTITY_NAME="$(json_value "$BOOTSTRAP_FILE" entity.name)"
[ -n "$ORGANIZATION_ID" ] || fail "No organization_id returned"
[ -n "$ENTITY_ID" ] || fail "No entity_id returned"
echo "ORGANIZATION_ID=$ORGANIZATION_ID"
echo "ENTITY_ID=$ENTITY_ID"
echo "ENTITY_NAME=$ENTITY_NAME"

echo ""
echo "================ EXPLICIT WRITE-SAFE CONFIRMATION ================"
echo "The database probe performs real Finance writes inside a PostgreSQL subtransaction."
echo "It deliberately raises a controlled exception and rolls every probe row back before returning."
printf "Type RUN_ROLLBACK_SAFE_FINANCE_ACCEPTANCE exactly: "
IFS= read -r FINANCE_ACCEPTANCE_CONFIRM
if [ "$FINANCE_ACCEPTANCE_CONFIRM" != "RUN_ROLLBACK_SAFE_FINANCE_ACCEPTANCE" ]; then
  fail "Acceptance confirmation did not match"
fi

echo ""
echo "================ RUN TOTAL ACCEPTANCE ================"
FINANCE_ACCEPTANCE_BASE_URL="$BASE_URL" \
FINANCE_ACCEPTANCE_ORGANIZATION_ID="$ORGANIZATION_ID" \
FINANCE_ACCEPTANCE_ENTITY_ID="$ENTITY_ID" \
FINANCE_ACCEPTANCE_ACTOR_ID="$ACTOR_ID" \
FINANCE_ACCEPTANCE_ACCESS_TOKEN="$ACCESS_TOKEN" \
FINANCE_ACCEPTANCE_COOKIE="$COOKIE_HEADER" \
FINANCE_ACCEPTANCE_CONFIRM="$FINANCE_ACCEPTANCE_CONFIRM" \
FINANCE_ACCEPTANCE_REPORT="$REPORT" \
NEXT_PUBLIC_SUPABASE_URL="$SUPABASE_URL" \
SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
node scripts/finance-total-acceptance.mjs
ACCEPTANCE_STATUS=$?

echo ""
echo "================ FINAL STATUS ================"
echo "ACCEPTANCE_STATUS=$ACCEPTANCE_STATUS"
echo "REPORT=$REPORT"
if [ "$ACCEPTANCE_STATUS" -eq 0 ]; then
  echo "FINANCE TOTAL ACCEPTANCE PASSED"
else
  echo "FINANCE TOTAL ACCEPTANCE FAILED"
fi

echo ""
printf "Terminal will stay open. Copy the complete result, then press Enter..."
IFS= read -r _
exit "$ACCEPTANCE_STATUS"
