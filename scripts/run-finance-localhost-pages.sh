#!/usr/bin/env bash

set -u

PROJECT_ROOT="${AVANTIQO_PROJECT_ROOT:-$HOME/Projects/churchill-control-new}"
BASE_URL="http://127.0.0.1:3000"
STAMP="$(date +%Y%m%d_%H%M%S)"
REPORT_FILE="/tmp/AVANTIQO_FINANCE_PAGE_SMOKE_${STAMP}.json"
SESSION_FILE="$(mktemp)"
BOOTSTRAP_FILE="$(mktemp)"

cleanup() {
  rm -f "$SESSION_FILE" "$BOOTSTRAP_FILE"
  unset FINANCE_SMOKE_PASSWORD FINANCE_SMOKE_ACCESS_TOKEN FINANCE_SMOKE_COOKIE 2>/dev/null || true
}
trap cleanup EXIT

fail() {
  echo ""
  echo "FAILED: $1"
  echo "REPORT=$REPORT_FILE"
  echo ""
  printf "Terminal will stay open. Press Enter when finished..."
  IFS= read -r _
  exit 1
}

json_value() {
  node - "$1" "$2" <<'NODE'
const fs = require("fs");
const data = JSON.parse(fs.readFileSync(process.argv[2], "utf8") || "{}");
const value = process.argv[3]
  .split(".")
  .filter(Boolean)
  .reduce((current, part) => current?.[part], data);
if (value !== undefined && value !== null) process.stdout.write(String(value));
NODE
}

echo "============================================================"
echo "AVANTIQO FINANCE AUTHENTICATED PAGE SMOKE"
echo "============================================================"
echo "Project: $PROJECT_ROOT"
echo "Report:  $REPORT_FILE"
echo ""

cd "$PROJECT_ROOT" || fail "Project folder not found"

command -v node >/dev/null 2>&1 || fail "Node.js is missing"
command -v curl >/dev/null 2>&1 || fail "curl is missing"

[ -f scripts/create-finance-smoke-session.mjs ] || fail "Session helper is missing"
[ -f scripts/finance-total-closure-smoke.mjs ] || fail "Finance smoke harness is missing"

STATUS="$(curl --silent --max-time 5 --output /dev/null --write-out '%{http_code}' "$BASE_URL" 2>/dev/null || true)"
if [ "$STATUS" = "000" ] || [ -z "$STATUS" ]; then
  fail "localhost:3000 is not running"
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

node scripts/create-finance-smoke-session.mjs > "$SESSION_FILE" || fail "Unable to create authenticated Supabase session"

ACCESS_TOKEN="$(json_value "$SESSION_FILE" accessToken)"
COOKIE_HEADER="$(json_value "$SESSION_FILE" cookieHeader)"
USER_ID="$(json_value "$SESSION_FILE" userId)"
USER_EMAIL="$(json_value "$SESSION_FILE" userEmail)"

[ -n "$ACCESS_TOKEN" ] || fail "Session access token is missing"
[ -n "$COOKIE_HEADER" ] || fail "Session cookie is missing"
[ -n "$USER_ID" ] || fail "Session user ID is missing"

echo "AUTHENTICATED_USER=$USER_EMAIL"

echo ""
echo "================ RESOLVE BUSINESS CONTEXT ================"

BOOTSTRAP_STATUS="$({
  USER_PAYLOAD="$(USER_ID="$USER_ID" node <<'NODE'
process.stdout.write(JSON.stringify({ user_id: process.env.USER_ID }));
NODE
)"

  printf '%s' "$USER_PAYLOAD" |
    curl \
      --silent \
      --show-error \
      --output "$BOOTSTRAP_FILE" \
      --write-out '%{http_code}' \
      --request POST \
      --header "Content-Type: application/json" \
      --header "Cookie: $COOKIE_HEADER" \
      --data-binary @- \
      "$BASE_URL/api/session/bootstrap"
})"

if [ "$BOOTSTRAP_STATUS" != "200" ]; then
  echo "BOOTSTRAP_STATUS=$BOOTSTRAP_STATUS"
  cat "$BOOTSTRAP_FILE"
  fail "Session bootstrap failed"
fi

ORGANIZATION_ID="$(json_value "$BOOTSTRAP_FILE" organization_id)"
ENTITY_ID="$(json_value "$BOOTSTRAP_FILE" entity_id)"
ENTITY_NAME="$(json_value "$BOOTSTRAP_FILE" entity.name)"

[ -n "$ORGANIZATION_ID" ] || fail "Bootstrap returned no organization_id"
[ -n "$ENTITY_ID" ] || fail "Bootstrap returned no entity_id"

echo "ORGANIZATION_ID=$ORGANIZATION_ID"
echo "ENTITY_ID=$ENTITY_ID"
echo "ENTITY_NAME=$ENTITY_NAME"

echo ""
echo "================ RUN COMPLETE FINANCE SMOKE ================"

FINANCE_SMOKE_BASE_URL="$BASE_URL" \
FINANCE_SMOKE_ORGANIZATION_ID="$ORGANIZATION_ID" \
FINANCE_SMOKE_ENTITY_ID="$ENTITY_ID" \
FINANCE_SMOKE_ACCESS_TOKEN="$ACCESS_TOKEN" \
FINANCE_SMOKE_COOKIE="$COOKIE_HEADER" \
FINANCE_SMOKE_REPORT="$REPORT_FILE" \
node scripts/finance-total-closure-smoke.mjs
SMOKE_STATUS=$?

echo ""
echo "================ FINAL RESULT ================"
echo "SMOKE_STATUS=$SMOKE_STATUS"
echo "REPORT=$REPORT_FILE"

if [ "$SMOKE_STATUS" -eq 0 ]; then
  echo "FINANCE AUTHENTICATED PAGE SMOKE PASSED"
else
  echo "FINANCE AUTHENTICATED PAGE SMOKE FAILED"
fi

echo ""
printf "Terminal will stay open. Copy the complete result, then press Enter..."
IFS= read -r _

exit "$SMOKE_STATUS"
