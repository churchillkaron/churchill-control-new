#!/usr/bin/env bash
set -u

REPO="${COLE_PREFLIGHT_REPO:-$HOME/Projects/churchill-control-preflight}"
REQUESTED_APP_PORT="${COLE_PREFLIGHT_APP_PORT:-3011}"
REQUESTED_SOURCE_PORT="${COLE_PREFLIGHT_SOURCE_PORT:-43871}"
APP_PORT="${REQUESTED_APP_PORT}"
SOURCE_PORT="${REQUESTED_SOURCE_PORT}"
STAMP="$(date +%Y%m%d_%H%M%S)"
RUNNER="scripts/creative-studio-cole-persisted-preflight.mjs"
SERVER_PID=""
AUTH_FILE="$(mktemp)"
USER_FILE="$(mktemp)"

cleanup() {
  rm -f "${AUTH_FILE}" "${USER_FILE}"
  if [ -n "${SERVER_PID}" ] && kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
}

fail() {
  echo "STOP: $1"
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
    values[name] = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
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

port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"${port}" -sTCP:LISTEN -t 2>/dev/null | grep -q .
    return $?
  fi
  return 1
}

next_free_port() {
  local candidate="$1"
  local attempts=0
  while port_in_use "${candidate}"; do
    candidate=$((candidate + 1))
    attempts=$((attempts + 1))
    if [ "${attempts}" -ge 100 ]; then
      return 1
    fi
  done
  printf '%s' "${candidate}"
}

acquire_access_token() {
  local supabase_url="$1"
  local anon_key="$2"
  local access_token="${CREATIVE_SMOKE_BEARER_TOKEN:-}"
  local auth_user_email=""
  local user_status=""

  if [ -n "${access_token}" ]; then
    user_status="$({
      curl \
        --silent \
        --show-error \
        --max-time 20 \
        --output "${USER_FILE}" \
        --write-out '%{http_code}' \
        --header "apikey: ${anon_key}" \
        --header "Authorization: Bearer ${access_token}" \
        "${supabase_url}/auth/v1/user"
    })"

    if [ "${user_status}" = "200" ]; then
      auth_user_email="$(json_value "${USER_FILE}" email)"
      export CREATIVE_SMOKE_BEARER_TOKEN="${access_token}"
      echo "AUTH_TOKEN_REUSED=YES"
      echo "AUTHENTICATED_USER=${auth_user_email}"
      return 0
    fi

    echo "AUTH_TOKEN_REUSED=NO"
    echo "AUTH_TOKEN_REFRESH_REQUIRED=YES"
    access_token=""
    CREATIVE_SMOKE_BEARER_TOKEN=""
    export CREATIVE_SMOKE_BEARER_TOKEN
  fi

  local login_email="${CREATIVE_SMOKE_EMAIL:-}"
  local login_password="${CREATIVE_SMOKE_PASSWORD:-}"

  if [ -z "${login_email}" ]; then
    printf "Avantiqo login email: "
    IFS= read -r login_email
  fi

  if [ -z "${login_password}" ]; then
    printf "Avantiqo login password: "
    IFS= read -r -s login_password
    echo ""
  fi

  [ -n "${login_email}" ] || fail "Avantiqo login email is required"
  [ -n "${login_password}" ] || fail "Avantiqo login password is required"

  local auth_payload
  auth_payload="$({
    SMOKE_EMAIL="${login_email}" \
    SMOKE_PASSWORD="${login_password}" \
    node <<'NODE'
process.stdout.write(JSON.stringify({
  email: process.env.SMOKE_EMAIL,
  password: process.env.SMOKE_PASSWORD,
}));
NODE
  })"

  local auth_status
  auth_status="$({
    printf '%s' "${auth_payload}" |
      curl \
        --silent \
        --show-error \
        --max-time 30 \
        --output "${AUTH_FILE}" \
        --write-out '%{http_code}' \
        --request POST \
        --header "apikey: ${anon_key}" \
        --header "Content-Type: application/json" \
        --data-binary @- \
        "${supabase_url}/auth/v1/token?grant_type=password"
  })"

  login_password=""
  auth_payload=""
  CREATIVE_SMOKE_PASSWORD=""
  unset CREATIVE_SMOKE_PASSWORD 2>/dev/null || true

  if [ "${auth_status}" != "200" ]; then
    echo "AUTH_STATUS=${auth_status}"
    node - "${AUTH_FILE}" <<'NODE'
const fs = require("fs");
try {
  const data = JSON.parse(fs.readFileSync(process.argv[2], "utf8") || "{}");
  console.log(`AUTH_ERROR=${data.msg || data.message || data.error_description || data.error || "Unknown authentication error"}`);
} catch {
  console.log("AUTH_ERROR=Unreadable authentication response");
}
NODE
    fail "Avantiqo authentication failed"
  fi

  access_token="$(json_value "${AUTH_FILE}" access_token)"
  auth_user_email="$(json_value "${AUTH_FILE}" user.email)"
  [ -n "${access_token}" ] || fail "Authentication did not return an access token"

  export CREATIVE_SMOKE_BEARER_TOKEN="${access_token}"
  echo "AUTH_TOKEN_REFRESHED=YES"
  echo "AUTHENTICATED_USER=${auth_user_email}"
}

trap cleanup EXIT INT TERM

[ -d "${REPO}" ] || fail "Preflight worktree not found: ${REPO}"
git -C "${REPO}" rev-parse --is-inside-work-tree >/dev/null 2>&1 || \
  fail "Path is not a Git worktree: ${REPO}"
cd "${REPO}" || fail "Cannot enter preflight worktree"

[ -f "${RUNNER}" ] || fail "Runner missing: ${RUNNER}"
[ -d ".next" ] || fail "Production build missing. Run the validated build first."
command -v curl >/dev/null 2>&1 || fail "curl not found"

SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-$(read_env_value NEXT_PUBLIC_SUPABASE_URL)}"
if [ -z "${SUPABASE_URL}" ]; then
  SUPABASE_URL="${SUPABASE_URL:-$(read_env_value SUPABASE_URL)}"
fi
ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-$(read_env_value NEXT_PUBLIC_SUPABASE_ANON_KEY)}"
if [ -z "${ANON_KEY}" ]; then
  ANON_KEY="${SUPABASE_ANON_KEY:-$(read_env_value SUPABASE_ANON_KEY)}"
fi
[ -n "${SUPABASE_URL}" ] || fail "NEXT_PUBLIC_SUPABASE_URL is missing from .env.local"
[ -n "${ANON_KEY}" ] || fail "NEXT_PUBLIC_SUPABASE_ANON_KEY is missing from .env.local"
SUPABASE_URL="${SUPABASE_URL%/}"

FFMPEG_BIN="${CREATIVE_MEDIA_FFMPEG_PATH:-$(command -v ffmpeg || true)}"
FFPROBE_BIN="${CREATIVE_MEDIA_FFPROBE_PATH:-$(command -v ffprobe || true)}"
[ -n "${FFMPEG_BIN}" ] || fail "ffmpeg not found"
[ -n "${FFPROBE_BIN}" ] || fail "ffprobe not found"

for file in \
  IMG_0013.MOV \
  IMG_0021.MOV \
  IMG_0023.MOV \
  IMG_0973.MOV \
  IMG_0974.MOV \
  IMG_0975.MOV \
  IMG_2622.MOV \
  IMG_2628.MOV \
  cole-logo1.png
do
  [ -r "$HOME/Downloads/${file}" ] || fail "Source file missing: $HOME/Downloads/${file}"
done

APP_PORT="$(next_free_port "${REQUESTED_APP_PORT}")" || \
  fail "No free application port found from ${REQUESTED_APP_PORT}"
SOURCE_PORT="$(next_free_port "${REQUESTED_SOURCE_PORT}")" || \
  fail "No free source port found from ${REQUESTED_SOURCE_PORT}"

if [ "${APP_PORT}" = "${SOURCE_PORT}" ]; then
  SOURCE_PORT="$(next_free_port $((SOURCE_PORT + 1)))" || \
    fail "No separate free source port found"
fi

BASE_URL="http://127.0.0.1:${APP_PORT}"
SERVER_LOG="${COLE_PREFLIGHT_SERVER_LOG:-$HOME/Downloads/COLE_LEY_PREFLIGHT_SERVER_${STAMP}.log}"

acquire_access_token "${SUPABASE_URL}" "${ANON_KEY}"

if [ -z "${CREATIVE_LOCAL_SOURCE_PREFLIGHT_TOKEN:-}" ]; then
  if command -v openssl >/dev/null 2>&1; then
    CREATIVE_LOCAL_SOURCE_PREFLIGHT_TOKEN="$(openssl rand -hex 32)"
  else
    CREATIVE_LOCAL_SOURCE_PREFLIGHT_TOKEN="$(date +%s)-$$-$RANDOM-$RANDOM"
  fi
fi

export CREATIVE_LOCAL_SOURCE_PREFLIGHT_ENABLED="true"
export CREATIVE_LOCAL_SOURCE_PREFLIGHT_TOKEN
export CREATIVE_MEDIA_FFMPEG_PATH="${FFMPEG_BIN}"
export CREATIVE_MEDIA_FFPROBE_PATH="${FFPROBE_BIN}"
export CREATIVE_MEDIA_INSPECTION_TIMEOUT_MS="${CREATIVE_MEDIA_INSPECTION_TIMEOUT_MS:-3600000}"
export CREATIVE_MEDIA_TEMPORAL_TIMEOUT_MS="${CREATIVE_MEDIA_TEMPORAL_TIMEOUT_MS:-3600000}"
export COLE_PREFLIGHT_BASE_URL="${BASE_URL}"
export COLE_PREFLIGHT_SOURCE_PORT="${SOURCE_PORT}"
export COLE_PREFLIGHT_KEY="${COLE_PREFLIGHT_KEY:-cole-ley-live-showreel-v2}"
export COLE_PREFLIGHT_STATE="${COLE_PREFLIGHT_STATE:-$HOME/Downloads/COLE_LEY_PERSISTED_PREFLIGHT_STATE_V2.json}"

node --check "${RUNNER}" || fail "Runner syntax validation failed"

echo "============================================================"
echo "COLE LEY PERSISTED LOCAL SHORTLIST"
echo "============================================================"
echo "COMMIT=$(git rev-parse HEAD)"
echo "REQUESTED_APP_PORT=${REQUESTED_APP_PORT}"
echo "SELECTED_APP_PORT=${APP_PORT}"
echo "REQUESTED_SOURCE_PORT=${REQUESTED_SOURCE_PORT}"
echo "SELECTED_SOURCE_PORT=${SOURCE_PORT}"
echo "APP_URL=${BASE_URL}"
echo "DATABASE_WRITES=YES"
echo "PROVIDER_CALLS=NO"
echo "WALLET_CHARGES=NO"
echo "PRODUCTION_STARTED=NO"
echo "SERVER_LOG=${SERVER_LOG}"
echo "STATE=${COLE_PREFLIGHT_STATE}"
echo "============================================================"

npm run start -- -p "${APP_PORT}" >"${SERVER_LOG}" 2>&1 &
SERVER_PID="$!"

READY="NO"
for attempt in $(seq 1 90); do
  if ! kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    echo "SERVER_EXITED_BEFORE_READY=YES"
    tail -n 120 "${SERVER_LOG}" || true
    exit 1
  fi

  STATUS="$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/" || true)"
  case "${STATUS}" in
    2*|3*|4*)
      READY="YES"
      break
      ;;
  esac
  sleep 1
done

if [ "${READY}" != "YES" ]; then
  echo "SERVER_READY=NO"
  tail -n 120 "${SERVER_LOG}" || true
  exit 1
fi

echo "SERVER_READY=YES"
node "${RUNNER}"
RUN_STATUS="$?"

echo ""
echo "============================================================"
echo "LOCAL_SHORTLIST_STATUS=${RUN_STATUS}"
echo "PROVIDER_CALLS=NO"
echo "WALLET_CHARGES=NO"
echo "PRODUCTION_STARTED=NO"
echo "SERVER_LOG=${SERVER_LOG}"
echo "STATE=${COLE_PREFLIGHT_STATE}"
echo "============================================================"

exit "${RUN_STATUS}"
