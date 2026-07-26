#!/usr/bin/env bash

set -u

PROJECT_ROOT="${AVANTIQO_PROJECT_ROOT:-$HOME/Projects/churchill-control-new}"
BASE_URL="http://127.0.0.1:3000"
STAMP="$(date +%Y%m%d_%H%M%S)"
SESSION_FILE="$(mktemp)"
BOOTSTRAP_FILE="$(mktemp)"
REPORT="/tmp/AVANTIQO_FINANCE_UI_ACTION_SECURITY_CERTIFICATION_${STAMP}.json"

cleanup() {
  rm -f "$SESSION_FILE" "$BOOTSTRAP_FILE"
  unset FINANCE_SMOKE_PASSWORD FINANCE_CERT_ACCESS_TOKEN FINANCE_CERT_COOKIE 2>/dev/null || true
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
echo "AVANTIQO FINANCE UI ACTION SECURITY CERTIFICATION"
echo "============================================================"
echo "Project: $PROJECT_ROOT"
echo "Report:  $REPORT"
echo ""

cd "$PROJECT_ROOT" || fail "Project directory not found"
command -v node >/dev/null 2>&1 || fail "Node.js is missing"
command -v curl >/dev/null 2>&1 || fail "curl is missing"

if [ -n "$(git status --porcelain)" ]; then
  git status --short
  fail "Working tree must be clean before certification"
fi

echo "================ SYNC MAIN ================"
git fetch origin || fail "git fetch failed"
git switch main || fail "Cannot switch to main"
git pull --ff-only origin main || fail "Cannot fast-forward main"
echo "MAIN=$(git rev-parse HEAD)"

[ -f scripts/finance-ui-action-security-certification.mjs ] || fail "Certification engine is missing"
[ -f scripts/create-finance-smoke-session.mjs ] || fail "Session helper is missing"

SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-$(read_env_value NEXT_PUBLIC_SUPABASE_URL)}"
ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-$(read_env_value NEXT_PUBLIC_SUPABASE_ANON_KEY)}"
[ -n "$SUPABASE_URL" ] || fail "NEXT_PUBLIC_SUPABASE_URL missing"
[ -n "$ANON_KEY" ] || fail "NEXT_PUBLIC_SUPABASE_ANON_KEY missing"
export NEXT_PUBLIC_SUPABASE_URL="$SUPABASE_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"

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
PERIOD_ID="$(json_value "$BOOTSTRAP_FILE" period_id)"
ENTITY_NAME="$(json_value "$BOOTSTRAP_FILE" entity.name)"
[ -n "$ORGANIZATION_ID" ] || fail "No organization_id returned"
[ -n "$ENTITY_ID" ] || fail "No entity_id returned"
echo "ORGANIZATION_ID=$ORGANIZATION_ID"
echo "ENTITY_ID=$ENTITY_ID"
echo "PERIOD_ID=$PERIOD_ID"
echo "ENTITY_NAME=$ENTITY_NAME"

echo ""
echo "================ RUN CERTIFICATION ================"
FINANCE_CERT_BASE_URL="$BASE_URL" \
FINANCE_CERT_ORGANIZATION_ID="$ORGANIZATION_ID" \
FINANCE_CERT_ENTITY_ID="$ENTITY_ID" \
FINANCE_CERT_PERIOD_ID="$PERIOD_ID" \
FINANCE_CERT_ACCESS_TOKEN="$ACCESS_TOKEN" \
FINANCE_CERT_COOKIE="$COOKIE_HEADER" \
FINANCE_CERT_REPORT="$REPORT" \
node scripts/finance-ui-action-security-certification.mjs
CERT_STATUS=$?

echo ""
echo "================ FINAL STATUS ================"
echo "CERTIFICATION_STATUS=$CERT_STATUS"
echo "REPORT=$REPORT"
if [ "$CERT_STATUS" -eq 0 ]; then
  echo "FINANCE UI ACTION SECURITY CERTIFICATION PASSED"
else
  echo "FINANCE UI ACTION SECURITY CERTIFICATION FAILED"
fi

echo ""
printf "Terminal will stay open. Copy the complete result, then press Enter..."
IFS= read -r _
exit "$CERT_STATUS"
