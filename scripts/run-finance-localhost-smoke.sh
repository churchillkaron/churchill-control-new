#!/usr/bin/env bash

set -u

PROJECT_ROOT="${AVANTIQO_PROJECT_ROOT:-$HOME/Projects/churchill-control-new}"
BASE_URL="http://127.0.0.1:3000"
STAMP="$(date +%Y%m%d_%H%M%S)"
SERVER_LOG="/tmp/AVANTIQO_FINANCE_LOCALHOST_3000_${STAMP}.log"
REPORT_FILE="/tmp/AVANTIQO_FINANCE_LOCALHOST_SMOKE_${STAMP}.json"
AUTH_FILE="$(mktemp)"
USER_FILE="$(mktemp)"
STAFF_FILE="$(mktemp)"
ENTITY_FILE="$(mktemp)"
SERVER_STARTED=0
SERVER_PID=""

cleanup() {
  rm -f "$AUTH_FILE" "$USER_FILE" "$STAFF_FILE" "$ENTITY_FILE"
}
trap cleanup EXIT

fail() {
  echo ""
  echo "FAILED: $1"
  echo ""
  if [ "$SERVER_STARTED" -eq 1 ]; then
    echo "Localhost server remains running."
    echo "SERVER_PID=$SERVER_PID"
    echo "SERVER_LOG=$SERVER_LOG"
  fi
  echo "REPORT=$REPORT_FILE"
  echo ""
  printf "Terminal will stay open. Press Enter when finished..."
  IFS= read -r _
  exit 1
}

read_env_value() {
  local key="$1"

  node - "$key" <<'NODE'
const fs = require("fs");
const key = process.argv[2];
const values = {};

for (const filename of [".env", ".env.local"]) {
  if (!fs.existsSync(filename)) continue;

  const content = fs.readFileSync(filename, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const normalized = line.startsWith("export ")
      ? line.slice(7).trim()
      : line;
    const separator = normalized.indexOf("=");
    if (separator < 1) continue;

    const name = normalized.slice(0, separator).trim();
    let value = normalized.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[name] = value
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r");
  }
}

process.stdout.write(String(values[key] || ""));
NODE
}

json_value() {
  local file="$1"
  local expression="$2"

  node - "$file" "$expression" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const expression = process.argv[3];
const data = JSON.parse(fs.readFileSync(file, "utf8") || "{}");

const value = expression
  .split(".")
  .filter(Boolean)
  .reduce((current, part) => current?.[part], data);

if (value !== undefined && value !== null) {
  process.stdout.write(String(value));
}
NODE
}

http_status() {
  curl \
    --silent \
    --show-error \
    --max-time 5 \
    --output /dev/null \
    --write-out '%{http_code}' \
    "$1" 2>/dev/null || true
}

echo "============================================================"
echo "AVANTIQO FINANCE LOCALHOST 3000 SMOKE"
echo "============================================================"
echo "Project: $PROJECT_ROOT"
echo "Report:  $REPORT_FILE"
echo ""

[ -d "$PROJECT_ROOT" ] || fail "Project folder not found: $PROJECT_ROOT"
cd "$PROJECT_ROOT" || fail "Cannot enter project folder"

command -v node >/dev/null 2>&1 || fail "Node.js is not installed"
command -v npm >/dev/null 2>&1 || fail "npm is not installed"
command -v curl >/dev/null 2>&1 || fail "curl is not installed"

[ -f "scripts/finance-total-closure-smoke.mjs" ] || \
  fail "Finance smoke harness is missing. Pull the latest main branch first."

SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-$(read_env_value NEXT_PUBLIC_SUPABASE_URL)}"
if [ -z "$SUPABASE_URL" ]; then
  SUPABASE_URL="${SUPABASE_URL:-$(read_env_value SUPABASE_URL)}"
fi

ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-$(read_env_value NEXT_PUBLIC_SUPABASE_ANON_KEY)}"
if [ -z "$ANON_KEY" ]; then
  ANON_KEY="${SUPABASE_ANON_KEY:-$(read_env_value SUPABASE_ANON_KEY)}"
fi

SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$(read_env_value SUPABASE_SERVICE_ROLE_KEY)}"
if [ -z "$SERVICE_ROLE_KEY" ]; then
  SERVICE_ROLE_KEY="${SUPABASE_SERVICE_KEY:-$(read_env_value SUPABASE_SERVICE_KEY)}"
fi
if [ -z "$SERVICE_ROLE_KEY" ]; then
  SERVICE_ROLE_KEY="${SUPABASE_ADMIN_KEY:-$(read_env_value SUPABASE_ADMIN_KEY)}"
fi

[ -n "$SUPABASE_URL" ] || fail "NEXT_PUBLIC_SUPABASE_URL is missing from .env.local"
[ -n "$ANON_KEY" ] || fail "NEXT_PUBLIC_SUPABASE_ANON_KEY is missing from .env.local"
[ -n "$SERVICE_ROLE_KEY" ] || fail "SUPABASE_SERVICE_ROLE_KEY is missing from .env.local"

SUPABASE_URL="${SUPABASE_URL%/}"

echo "================ SYNC MAIN ================"

git fetch origin || fail "git fetch failed"

if [ -n "$(git status --porcelain)" ]; then
  echo "Local changes detected. They will not be deleted."
  git status --short
  fail "Commit or stash local changes before running the localhost smoke"
fi

git switch main || fail "Cannot switch to main"
git pull --ff-only origin main || fail "Local main cannot fast-forward to origin/main"

echo "MAIN=$(git rev-parse HEAD)"

echo ""
echo "================ START LOCALHOST 3000 ================"

CURRENT_STATUS="$(http_status "$BASE_URL")"

if [ "$CURRENT_STATUS" = "000" ] || [ -z "$CURRENT_STATUS" ]; then
  if command -v lsof >/dev/null 2>&1 && lsof -ti tcp:3000 >/dev/null 2>&1; then
    fail "Port 3000 is occupied but is not responding as an HTTP server"
  fi

  if [ ! -x "node_modules/.bin/next" ]; then
    echo "Dependencies are missing. Running npm install..."
    npm install || fail "npm install failed"
  fi

  echo "Starting Next.js on localhost:3000..."
  nohup npm run dev -- -p 3000 >"$SERVER_LOG" 2>&1 &
  SERVER_PID=$!
  SERVER_STARTED=1

  READY=0
  for _ in $(seq 1 120); do
    sleep 1
    CURRENT_STATUS="$(http_status "$BASE_URL")"
    if [ "$CURRENT_STATUS" != "000" ] && [ -n "$CURRENT_STATUS" ]; then
      READY=1
      break
    fi

    if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
      echo ""
      tail -n 100 "$SERVER_LOG" 2>/dev/null || true
      fail "Next.js stopped before localhost:3000 became ready"
    fi
  done

  if [ "$READY" -ne 1 ]; then
    echo ""
    tail -n 100 "$SERVER_LOG" 2>/dev/null || true
    fail "localhost:3000 did not become ready"
  fi
else
  echo "Using the existing server on localhost:3000."
fi

echo "LOCALHOST_STATUS=$CURRENT_STATUS"
if [ "$SERVER_STARTED" -eq 1 ]; then
  echo "SERVER_PID=$SERVER_PID"
  echo "SERVER_LOG=$SERVER_LOG"
fi

echo ""
echo "================ AUTHENTICATE ================"

ACCESS_TOKEN="${FINANCE_SMOKE_ACCESS_TOKEN:-}"
AUTH_USER_ID=""
AUTH_USER_EMAIL=""

if [ -z "$ACCESS_TOKEN" ]; then
  LOGIN_EMAIL="${FINANCE_SMOKE_EMAIL:-}"
  LOGIN_PASSWORD="${FINANCE_SMOKE_PASSWORD:-}"

  if [ -z "$LOGIN_EMAIL" ]; then
    printf "Avantiqo login email: "
    IFS= read -r LOGIN_EMAIL
  fi

  if [ -z "$LOGIN_PASSWORD" ]; then
    printf "Avantiqo login password: "
    IFS= read -r -s LOGIN_PASSWORD
    echo ""
  fi

  [ -n "$LOGIN_EMAIL" ] || fail "Login email is required"
  [ -n "$LOGIN_PASSWORD" ] || fail "Login password is required"

  AUTH_PAYLOAD="$({
    SMOKE_EMAIL="$LOGIN_EMAIL" \
    SMOKE_PASSWORD="$LOGIN_PASSWORD" \
    node <<'NODE'
process.stdout.write(JSON.stringify({
  email: process.env.SMOKE_EMAIL,
  password: process.env.SMOKE_PASSWORD,
}));
NODE
  })"

  AUTH_STATUS="$({
    printf '%s' "$AUTH_PAYLOAD" |
      curl \
        --silent \
        --show-error \
        --output "$AUTH_FILE" \
        --write-out '%{http_code}' \
        --request POST \
        --header "apikey: $ANON_KEY" \
        --header "Content-Type: application/json" \
        --data-binary @- \
        "$SUPABASE_URL/auth/v1/token?grant_type=password"
  })"

  LOGIN_PASSWORD=""
  AUTH_PAYLOAD=""
  unset FINANCE_SMOKE_PASSWORD 2>/dev/null || true

  if [ "$AUTH_STATUS" != "200" ]; then
    echo "AUTH_STATUS=$AUTH_STATUS"
    node - "$AUTH_FILE" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
try {
  const data = JSON.parse(fs.readFileSync(file, "utf8") || "{}");
  console.log(`AUTH_ERROR=${data.msg || data.message || data.error_description || data.error || "Unknown authentication error"}`);
} catch {
  console.log("AUTH_ERROR=Unreadable authentication response");
}
NODE
    fail "Avantiqo authentication failed"
  fi

  ACCESS_TOKEN="$(json_value "$AUTH_FILE" access_token)"
  AUTH_USER_ID="$(json_value "$AUTH_FILE" user.id)"
  AUTH_USER_EMAIL="$(json_value "$AUTH_FILE" user.email)"
else
  USER_STATUS="$({
    curl \
      --silent \
      --show-error \
      --output "$USER_FILE" \
      --write-out '%{http_code}' \
      --header "apikey: $ANON_KEY" \
      --header "Authorization: Bearer $ACCESS_TOKEN" \
      "$SUPABASE_URL/auth/v1/user"
  })"

  [ "$USER_STATUS" = "200" ] || fail "FINANCE_SMOKE_ACCESS_TOKEN is invalid or expired"
  AUTH_USER_ID="$(json_value "$USER_FILE" id)"
  AUTH_USER_EMAIL="$(json_value "$USER_FILE" email)"
fi

[ -n "$ACCESS_TOKEN" ] || fail "Authentication did not return an access token"
[ -n "$AUTH_USER_ID" ] || fail "Authentication did not return a user ID"

echo "AUTHENTICATED_USER=$AUTH_USER_EMAIL"

echo ""
echo "================ DISCOVER BUSINESS CONTEXT ================"

STAFF_STATUS="$({
  curl \
    --silent \
    --show-error \
    --output "$STAFF_FILE" \
    --write-out '%{http_code}' \
    --header "apikey: $SERVICE_ROLE_KEY" \
    --header "Authorization: Bearer $SERVICE_ROLE_KEY" \
    "$SUPABASE_URL/rest/v1/staff_accounts?select=*&limit=1000"
})"

[ "$STAFF_STATUS" = "200" ] || fail "Unable to read staff_accounts from Supabase"

CONTEXT_OUTPUT="$({
  AUTH_USER_ID="$AUTH_USER_ID" \
  AUTH_USER_EMAIL="$AUTH_USER_EMAIL" \
  node - "$STAFF_FILE" <<'NODE'
const fs = require("fs");
const rows = JSON.parse(fs.readFileSync(process.argv[2], "utf8") || "[]");
const userId = String(process.env.AUTH_USER_ID || "").trim();
const userEmail = String(process.env.AUTH_USER_EMAIL || "").trim().toLowerCase();

function clean(value) {
  const result = String(value ?? "").trim();
  return result && result !== "null" && result !== "undefined" ? result : "";
}

function active(row) {
  if (row.archived === true) return false;
  if (row.active === false || row.is_active === false || row.enabled === false) return false;
  const status = clean(row.status).toUpperCase();
  return !["INACTIVE", "DISABLED", "SUSPENDED", "TERMINATED", "ARCHIVED", "REVOKED"].includes(status);
}

function matches(row) {
  const ids = [
    row.user_id,
    row.auth_user_id,
    row.supabase_user_id,
    row.profile_id,
    row.account_user_id,
    row.id,
  ].map(clean).filter(Boolean);

  const emails = [
    row.email,
    row.user_email,
    row.auth_email,
    row.login_email,
  ].map((value) => clean(value).toLowerCase()).filter(Boolean);

  return (userId && ids.includes(userId)) || (userEmail && emails.includes(userEmail));
}

const staff = rows.find((row) => active(row) && matches(row));
if (!staff) {
  console.error("No active staff_accounts membership matches the authenticated user");
  process.exit(2);
}

const organizationId = clean(staff.organization_id);
if (!organizationId) {
  console.error("The matching staff account has no organization_id");
  process.exit(3);
}

const preferredEntityId = clean(staff.entity_id || staff.legal_entity_id);
console.log(`ORGANIZATION_ID=${organizationId}`);
console.log(`PREFERRED_ENTITY_ID=${preferredEntityId}`);
console.log(`STAFF_ACCOUNT_ID=${clean(staff.id)}`);
NODE
})" || fail "Could not discover the authenticated staff organisation"

ORGANIZATION_ID="$(printf '%s\n' "$CONTEXT_OUTPUT" | awk -F= '$1=="ORGANIZATION_ID" {print $2; exit}')"
PREFERRED_ENTITY_ID="$(printf '%s\n' "$CONTEXT_OUTPUT" | awk -F= '$1=="PREFERRED_ENTITY_ID" {print $2; exit}')"
STAFF_ACCOUNT_ID="$(printf '%s\n' "$CONTEXT_OUTPUT" | awk -F= '$1=="STAFF_ACCOUNT_ID" {print $2; exit}')"

[ -n "$ORGANIZATION_ID" ] || fail "No organization_id could be discovered"

ENTITY_QUERY="$SUPABASE_URL/rest/v1/legal_entities?select=*&organization_id=eq.$ORGANIZATION_ID&limit=1000"
ENTITY_STATUS="$({
  curl \
    --silent \
    --show-error \
    --output "$ENTITY_FILE" \
    --write-out '%{http_code}' \
    --header "apikey: $SERVICE_ROLE_KEY" \
    --header "Authorization: Bearer $SERVICE_ROLE_KEY" \
    "$ENTITY_QUERY"
})"

[ "$ENTITY_STATUS" = "200" ] || fail "Unable to read legal_entities for the discovered organisation"

ENTITY_OUTPUT="$({
  PREFERRED_ENTITY_ID="$PREFERRED_ENTITY_ID" \
  node - "$ENTITY_FILE" <<'NODE'
const fs = require("fs");
const rows = JSON.parse(fs.readFileSync(process.argv[2], "utf8") || "[]");
const preferred = String(process.env.PREFERRED_ENTITY_ID || "").trim();

function clean(value) {
  const result = String(value ?? "").trim();
  return result && result !== "null" && result !== "undefined" ? result : "";
}

function active(row) {
  if (row.archived === true) return false;
  if (row.active === false || row.is_active === false || row.enabled === false) return false;
  const status = clean(row.status).toUpperCase();
  return !["INACTIVE", "DISABLED", "SUSPENDED", "TERMINATED", "ARCHIVED", "REVOKED"].includes(status);
}

const activeRows = rows.filter(active);
const entity =
  activeRows.find((row) => clean(row.id) === preferred) ||
  activeRows.sort((a, b) => clean(a.name || a.legal_name).localeCompare(clean(b.name || b.legal_name)))[0];

if (!entity) {
  console.error("No active legal entity exists for the discovered organisation");
  process.exit(2);
}

console.log(`ENTITY_ID=${clean(entity.id)}`);
console.log(`ENTITY_NAME=${clean(entity.name || entity.legal_name || entity.code || entity.id)}`);
NODE
})" || fail "Could not discover an active legal entity"

ENTITY_ID="$(printf '%s\n' "$ENTITY_OUTPUT" | awk -F= '$1=="ENTITY_ID" {print $2; exit}')"
ENTITY_NAME="$(printf '%s\n' "$ENTITY_OUTPUT" | awk -F= '$1=="ENTITY_NAME" {sub(/^ENTITY_NAME=/, ""); print; exit}')"

[ -n "$ENTITY_ID" ] || fail "No entity_id could be discovered"

echo "STAFF_ACCOUNT_ID=$STAFF_ACCOUNT_ID"
echo "ORGANIZATION_ID=$ORGANIZATION_ID"
echo "ENTITY_ID=$ENTITY_ID"
echo "ENTITY_NAME=$ENTITY_NAME"

echo ""
echo "================ RUN FINANCE SMOKE ================"

FINANCE_SMOKE_BASE_URL="$BASE_URL" \
FINANCE_SMOKE_ORGANIZATION_ID="$ORGANIZATION_ID" \
FINANCE_SMOKE_ENTITY_ID="$ENTITY_ID" \
FINANCE_SMOKE_ACCESS_TOKEN="$ACCESS_TOKEN" \
FINANCE_SMOKE_REPORT="$REPORT_FILE" \
node scripts/finance-total-closure-smoke.mjs
SMOKE_STATUS=$?

ACCESS_TOKEN=""
unset FINANCE_SMOKE_ACCESS_TOKEN 2>/dev/null || true

echo ""
echo "================ FINAL RESULT ================"
echo "SMOKE_STATUS=$SMOKE_STATUS"
echo "REPORT=$REPORT_FILE"

if [ "$SERVER_STARTED" -eq 1 ]; then
  echo "SERVER_PID=$SERVER_PID"
  echo "SERVER_LOG=$SERVER_LOG"
  echo "LOCALHOST_3000=RUNNING"
else
  echo "LOCALHOST_3000=EXISTING_SERVER"
fi

if [ "$SMOKE_STATUS" -eq 0 ]; then
  echo "FINANCE LOCALHOST 3000 SMOKE PASSED"
else
  echo "FINANCE LOCALHOST 3000 SMOKE FAILED"
fi

echo ""
printf "Terminal will stay open. Copy the result, then press Enter..."
IFS= read -r _

exit "$SMOKE_STATUS"
