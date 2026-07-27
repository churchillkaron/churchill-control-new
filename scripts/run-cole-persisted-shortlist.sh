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

cleanup() {
  if [ -n "${SERVER_PID}" ] && kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
}

fail() {
  echo "STOP: $1"
  exit 1
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

trap cleanup EXIT INT TERM

[ -d "${REPO}" ] || fail "Preflight worktree not found: ${REPO}"
git -C "${REPO}" rev-parse --is-inside-work-tree >/dev/null 2>&1 || \
  fail "Path is not a Git worktree: ${REPO}"
cd "${REPO}" || fail "Cannot enter preflight worktree"

[ -f "${RUNNER}" ] || fail "Runner missing: ${RUNNER}"
[ -d ".next" ] || fail "Production build missing. Run the validated build first."

if [ -z "${CREATIVE_SMOKE_BEARER_TOKEN:-}" ] && [ -z "${CREATIVE_SMOKE_COOKIE:-}" ]; then
  fail "CREATIVE_SMOKE_BEARER_TOKEN or CREATIVE_SMOKE_COOKIE is required in this terminal"
fi

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
