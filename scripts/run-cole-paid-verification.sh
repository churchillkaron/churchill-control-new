#!/usr/bin/env bash
set -u

REPO="${COLE_PREFLIGHT_REPO:-$HOME/Projects/churchill-control-preflight}"
REQUESTED_APP_PORT="${COLE_PREFLIGHT_APP_PORT:-3011}"
SOURCE_PORT="43871"
RUNNER="scripts/creative-studio-cole-paid-verification.mjs"
STAMP="$(date +%Y%m%d_%H%M%S)"
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
  for (const rawLine of fs.readFileSync(filename, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separator = normalized.indexOf("=");
    if (separator < 1) continue;
    const name = normalized.slice(0, separator).trim();
    let value = normalized.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) value = value.slice(1, -1);
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
const data = JSON.parse(fs.readFileSync(process.argv[2], "utf8") || "{}");
const value = process.argv[3]
  .split(".")
  .filter(Boolean)
  .reduce((current, part) => current?.[part], data);
if (value !== undefined && value !== null) process.stdout.write(String(value));
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
    [ "${attempts}" -lt 100 ] || return 1
  done
  printf '%s' "${candidate}"
}

acquire_access_token() {
  local supabase_url="$1"
  local anon_key="$2"
  local access_token="${CREATIVE_SMOKE_BEARER_TOKEN:-}"

  if [ -n "${access_token}" ]; then
    local user_status
    user_status="$(curl --silent --show-error --max-time 20 \
      --output "${USER_FILE}" --write-out '%{http_code}' \
      --header "apikey: ${anon_key}" \
      --header "Authorization: Bearer ${access_token}" \
      "${supabase_url}/auth/v1/user")"
    if [ "${user_status}" = "200" ]; then
      export CREATIVE_SMOKE_BEARER_TOKEN="${access_token}"
      echo "AUTH_TOKEN_REUSED=YES"
      echo "AUTHENTICATED_USER=$(json_value "${USER_FILE}" email)"
      return 0
    fi
    echo "AUTH_TOKEN_REUSED=NO"
    echo "AUTH_TOKEN_REFRESH_REQUIRED=YES"
  fi

  local login_email="${CREATIVE_SMOKE_EMAIL:-}"
  local login_password="${CREATIVE_SMOKE_PASSWORD:-}"
  if [ -z "${login_email}" ]; then
    printf "Avantiqo login email: "
    IFS= read -r login_email
  fi
  login_email="$(printf '%s' "${login_email}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  if [ -z "${login_password}" ]; then
    printf "Avantiqo login password: "
    IFS= read -r -s login_password
    echo ""
  fi
  [ -n "${login_email}" ] || fail "Avantiqo login email is required"
  [ -n "${login_password}" ] || fail "Avantiqo login password is required"

  local auth_payload
  auth_payload="$(SMOKE_EMAIL="${login_email}" SMOKE_PASSWORD="${login_password}" node <<'NODE'
process.stdout.write(JSON.stringify({
  email: process.env.SMOKE_EMAIL,
  password: process.env.SMOKE_PASSWORD,
}));
NODE
)"

  local auth_status
  auth_status="$(printf '%s' "${auth_payload}" | curl \
    --silent --show-error --max-time 30 \
    --output "${AUTH_FILE}" --write-out '%{http_code}' \
    --request POST --header "apikey: ${anon_key}" \
    --header "Content-Type: application/json" --data-binary @- \
    "${supabase_url}/auth/v1/token?grant_type=password")"

  login_password=""
  auth_payload=""
  unset CREATIVE_SMOKE_PASSWORD 2>/dev/null || true

  if [ "${auth_status}" != "200" ]; then
    echo "AUTH_STATUS=${auth_status}"
    echo "AUTH_ERROR=$(json_value "${AUTH_FILE}" msg)"
    fail "Avantiqo authentication failed"
  fi

  access_token="$(json_value "${AUTH_FILE}" access_token)"
  [ -n "${access_token}" ] || fail "Authentication did not return an access token"
  export CREATIVE_SMOKE_BEARER_TOKEN="${access_token}"
  echo "AUTH_TOKEN_REFRESHED=YES"
  echo "AUTHENTICATED_USER=$(json_value "${AUTH_FILE}" user.email)"
}

trap cleanup EXIT INT TERM

[ -d "${REPO}" ] || fail "Preflight worktree not found: ${REPO}"
cd "${REPO}" || fail "Cannot enter preflight worktree"
[ -f "${RUNNER}" ] || fail "Runner missing: ${RUNNER}"
[ -d ".next" ] || fail "Production build missing"
command -v curl >/dev/null 2>&1 || fail "curl not found"
command -v ffmpeg >/dev/null 2>&1 || fail "ffmpeg not found"
command -v ffprobe >/dev/null 2>&1 || fail "ffprobe not found"

if port_in_use "${SOURCE_PORT}"; then
  fail "Required persisted source port ${SOURCE_PORT} is already in use"
fi

APP_PORT="$(next_free_port "${REQUESTED_APP_PORT}")" || fail "No free app port found"
[ "${APP_PORT}" != "${SOURCE_PORT}" ] || APP_PORT="$(next_free_port $((APP_PORT + 1)))"

SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-$(read_env_value NEXT_PUBLIC_SUPABASE_URL)}"
[ -n "${SUPABASE_URL}" ] || SUPABASE_URL="${SUPABASE_URL:-$(read_env_value SUPABASE_URL)}"
ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-$(read_env_value NEXT_PUBLIC_SUPABASE_ANON_KEY)}"
[ -n "${ANON_KEY}" ] || ANON_KEY="${SUPABASE_ANON_KEY:-$(read_env_value SUPABASE_ANON_KEY)}"
[ -n "${SUPABASE_URL}" ] || fail "Supabase URL missing"
[ -n "${ANON_KEY}" ] || fail "Supabase anon key missing"
SUPABASE_URL="${SUPABASE_URL%/}"

acquire_access_token "${SUPABASE_URL}" "${ANON_KEY}"

export CREATIVE_MEDIA_FFMPEG_PATH="${CREATIVE_MEDIA_FFMPEG_PATH:-$(command -v ffmpeg)}"
export CREATIVE_MEDIA_FFPROBE_PATH="${CREATIVE_MEDIA_FFPROBE_PATH:-$(command -v ffprobe)}"
export CREATIVE_MEDIA_INSPECTION_TIMEOUT_MS="${CREATIVE_MEDIA_INSPECTION_TIMEOUT_MS:-3600000}"
export CREATIVE_MEDIA_TEMPORAL_TIMEOUT_MS="${CREATIVE_MEDIA_TEMPORAL_TIMEOUT_MS:-3600000}"
export COLE_PREFLIGHT_BASE_URL="http://127.0.0.1:${APP_PORT}"
export COLE_PREFLIGHT_SOURCE_PORT="${SOURCE_PORT}"
export COLE_PREFLIGHT_STATE="${COLE_PREFLIGHT_STATE:-$HOME/Downloads/COLE_LEY_PERSISTED_PREFLIGHT_STATE_V2.json}"

node --check "${RUNNER}" || fail "Runner syntax validation failed"

SERVER_LOG="${COLE_VERIFICATION_SERVER_LOG:-$HOME/Downloads/COLE_LEY_VERIFICATION_SERVER_${STAMP}.log}"

echo "============================================================"
echo "COLE LEY BOUNDED PAID AI VERIFICATION"
echo "============================================================"
echo "COMMIT=$(git rev-parse HEAD)"
echo "APP_URL=${COLE_PREFLIGHT_BASE_URL}"
echo "SOURCE_PORT=${SOURCE_PORT}"
echo "MAXIMUM_AI_CALLS=28"
echo "MAXIMUM_CUSTOMER_PRICE=12.2304"
echo "CURRENCY=THB"
echo "PRODUCTION_AUTHORIZED=NO"
echo "PRODUCTION_STARTED=NO"
echo "SERVER_LOG=${SERVER_LOG}"
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
  STATUS="$(curl -s -o /dev/null -w '%{http_code}' "${COLE_PREFLIGHT_BASE_URL}/" || true)"
  case "${STATUS}" in
    2*|3*|4*) READY="YES"; break ;;
  esac
  sleep 1
done

[ "${READY}" = "YES" ] || fail "Server did not become ready"
echo "SERVER_READY=YES"

node "${RUNNER}"
RUN_STATUS="$?"

echo ""
echo "============================================================"
echo "PAID_VERIFICATION_STATUS=${RUN_STATUS}"
echo "PRODUCTION_AUTHORIZED=NO"
echo "PRODUCTION_STARTED=NO"
echo "SERVER_LOG=${SERVER_LOG}"
echo "============================================================"

exit "${RUN_STATUS}"
