#!/usr/bin/env bash
set -u
set -o pipefail

APP_URL="${CREATIVE_TEST_APP_URL:-${APP_URL:-}}"
ORGANIZATION_ID="${CREATIVE_TEST_ORGANIZATION_ID:-}"
AUTH_TOKEN="${CREATIVE_TEST_AUTH_TOKEN:-}"
COOKIE="${CREATIVE_TEST_COOKIE:-}"
WORKER_SECRET="${CREATIVE_TEST_WORKER_SECRET:-${CRON_SECRET:-${AVANTIQO_INTERNAL_WORKER_SECRET:-}}}"
MEDIUM="${CREATIVE_TEST_MEDIUM:-IMAGE}"
REQUEST="${CREATIVE_TEST_REQUEST:-Create one original premium image and a complete release package for the selected organization, grounded only in approved business truth and supplied references.}"
MAX_POLLS="${CREATIVE_TEST_MAX_POLLS:-40}"
POLL_SECONDS="${CREATIVE_TEST_POLL_SECONDS:-5}"
REPORT="${CREATIVE_TEST_REPORT:-/tmp/creative-end-to-end-smoke.json}"
ARTIFACT_DIR="${CREATIVE_TEST_ARTIFACT_DIR:-$(dirname "$REPORT")/creative-smoke-evidence}"
mkdir -p "$ARTIFACT_DIR"

fail() {
  echo "CREATIVE_END_TO_END_SMOKE=FAIL"
  echo "REASON=$1"
  if [ -f "$REPORT" ]; then
    echo "REPORT=$REPORT"
  fi
  echo "EVIDENCE_DIRECTORY=$ARTIFACT_DIR"
  exit 1
}

persist_json() {
  local source="$1"
  local name="$2"

  [ -f "$source" ] || return 0
  cp "$source" "$ARTIFACT_DIR/$name"

  if jq -e . "$source" >/dev/null 2>&1; then
    jq . "$source" > "$ARTIFACT_DIR/${name%.json}.pretty.json"
  fi
}

write_failure_summary() {
  local phase="$1"
  local status="$2"
  local body_file="$3"

  jq -n \
    --arg phase "$phase" \
    --arg http_status "$status" \
    --arg project_id "${PROJECT_ID:-}" \
    --arg mission_id "${MISSION_ID:-}" \
    --arg evidence_directory "$ARTIFACT_DIR" \
    --slurpfile body "$body_file" \
    '{
      result:"FAIL",
      phase:$phase,
      http_status:($http_status | tonumber? // $http_status),
      mission_id:$mission_id,
      project_id:$project_id,
      response:($body[0] // null),
      evidence_directory:$evidence_directory
    }' > "$REPORT" 2>/dev/null || true
}

command -v curl >/dev/null 2>&1 || fail "curl required"
command -v jq >/dev/null 2>&1 || fail "jq required"

[ -n "$APP_URL" ] || fail "CREATIVE_TEST_APP_URL required"
[ -n "$ORGANIZATION_ID" ] || fail "CREATIVE_TEST_ORGANIZATION_ID required"
[ -n "$WORKER_SECRET" ] || fail "CREATIVE_TEST_WORKER_SECRET, CRON_SECRET, or AVANTIQO_INTERNAL_WORKER_SECRET required"

APP_URL="${APP_URL%/}"
AUTH_HEADERS=()
if [ -n "$AUTH_TOKEN" ]; then
  AUTH_HEADERS+=( -H "Authorization: Bearer $AUTH_TOKEN" )
fi
if [ -n "$COOKIE" ]; then
  AUTH_HEADERS+=( -H "Cookie: $COOKIE" )
fi
if [ "${#AUTH_HEADERS[@]}" -eq 0 ]; then
  fail "CREATIVE_TEST_AUTH_TOKEN or CREATIVE_TEST_COOKIE required"
fi

case "$(printf '%s' "$MEDIUM" | tr '[:lower:]' '[:upper:]')" in
  FILM|VIDEO) PROJECT_TYPE="VIDEO" ;;
  IMAGE|PHOTO|POSTER|BANNER) PROJECT_TYPE="IMAGE" ;;
  WEBSITE|WEBPAGE|LANDING) PROJECT_TYPE="WEBSITE" ;;
  MENU) PROJECT_TYPE="MENU" ;;
  AUDIO|MUSIC|VOICE|SOUND) PROJECT_TYPE="AUDIO" ;;
  DOCUMENT|COPY|SCRIPT) PROJECT_TYPE="DOCUMENT" ;;
  PRESENTATION|DECK) PROJECT_TYPE="PRESENTATION" ;;
  *) PROJECT_TYPE="MULTIMEDIA" ;;
esac

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
COMPOSE_BODY="$TMP_DIR/compose.json"
EXECUTE_BODY="$TMP_DIR/execute.json"
WORKER_BODY="$TMP_DIR/worker.json"
CONTROL_BODY="$TMP_DIR/control.json"

printf 'Creative smoke: compose %s mission\n' "$PROJECT_TYPE"
COMPOSE_STATUS="$(
  jq -n \
    --arg organization_id "$ORGANIZATION_ID" \
    --arg request "$REQUEST" \
    --arg medium "$MEDIUM" \
    '{organization_id:$organization_id,request:$request,context:{smoke_test:true,requested_medium:$medium}}' \
  | curl -sS -o "$COMPOSE_BODY" -w '%{http_code}' \
      -X POST "$APP_URL/api/creative/missions/compose" \
      -H 'Content-Type: application/json' \
      "${AUTH_HEADERS[@]}" \
      --data-binary @-
)" || fail "mission compose request failed"
persist_json "$COMPOSE_BODY" "compose.json"

if [ "$COMPOSE_STATUS" -lt 200 ] || [ "$COMPOSE_STATUS" -ge 300 ]; then
  cat "$COMPOSE_BODY"
  write_failure_summary "MISSION_COMPOSE" "$COMPOSE_STATUS" "$COMPOSE_BODY"
  fail "mission compose returned HTTP $COMPOSE_STATUS"
fi
jq -e '.success == true' "$COMPOSE_BODY" >/dev/null || {
  cat "$COMPOSE_BODY"
  write_failure_summary "MISSION_COMPOSE_RESPONSE" "$COMPOSE_STATUS" "$COMPOSE_BODY"
  fail "mission compose did not return success"
}

MISSION_ID="$(jq -r '.mission.id // empty' "$COMPOSE_BODY")"
PROJECT_ID="$(
  jq -r --arg type "$PROJECT_TYPE" '
    (.projects // [])
    | map(select((.production_type // "") == $type))
    | .[0].id // empty
  ' "$COMPOSE_BODY"
)"

[ -n "$MISSION_ID" ] || fail "compose response missing mission id"
[ -n "$PROJECT_ID" ] || {
  jq '{deliverables:.blueprint.deliverables,projects:.projects}' "$COMPOSE_BODY"
  write_failure_summary "PROJECT_SELECTION" "$COMPOSE_STATUS" "$COMPOSE_BODY"
  fail "compose response missing requested $PROJECT_TYPE project"
}

printf 'Creative smoke: start project %s\n' "$PROJECT_ID"
EXECUTE_STATUS="$(
  jq -n \
    --arg organization_id "$ORGANIZATION_ID" \
    --arg mission_id "$MISSION_ID" \
    --arg project_id "$PROJECT_ID" \
    --arg objective "$REQUEST" \
    '{
      organization_id:$organization_id,
      creative_mission_id:$mission_id,
      creative_project_id:$project_id,
      objective:$objective,
      release_mode:"AUTOMATIC",
      max_cycles:1
    }' \
  | curl -sS -o "$EXECUTE_BODY" -w '%{http_code}' \
      -X POST "$APP_URL/api/creative/director/execute" \
      -H 'Content-Type: application/json' \
      "${AUTH_HEADERS[@]}" \
      --data-binary @-
)" || fail "director execute request failed"
persist_json "$EXECUTE_BODY" "execute.json"

if [ "$EXECUTE_STATUS" -lt 200 ] || [ "$EXECUTE_STATUS" -ge 300 ]; then
  cat "$EXECUTE_BODY"
  write_failure_summary "DIRECTOR_EXECUTE" "$EXECUTE_STATUS" "$EXECUTE_BODY"
  fail "director execute returned HTTP $EXECUTE_STATUS"
fi
jq -e '.success == true' "$EXECUTE_BODY" >/dev/null || {
  cat "$EXECUTE_BODY"
  write_failure_summary "DIRECTOR_EXECUTE_RESPONSE" "$EXECUTE_STATUS" "$EXECUTE_BODY"
  fail "director execute did not return success"
}
TASKS_MATERIALIZED="$(jq -r '.production.tasks_materialized // 0' "$EXECUTE_BODY")"
[ "$TASKS_MATERIALIZED" -gt 0 ] || {
  cat "$EXECUTE_BODY"
  write_failure_summary "PRODUCTION_TASK_MATERIALIZATION" "$EXECUTE_STATUS" "$EXECUTE_BODY"
  fail "production materialized zero tasks"
}

attempt=0
while [ "$attempt" -lt "$MAX_POLLS" ]; do
  attempt=$((attempt + 1))
  printf 'Creative smoke: worker/control poll %s of %s\n' "$attempt" "$MAX_POLLS"

  WORKER_STATUS="$(
    curl -sS -o "$WORKER_BODY" -w '%{http_code}' \
      -X POST "$APP_URL/api/creative/worker/autonomous" \
      -H "x-avantiqo-worker-secret: $WORKER_SECRET" \
      -H 'Content-Type: application/json' \
      --data '{"project_limit":100,"max_dispatches_per_project":100,"lease_seconds":180}'
  )" || fail "autonomous worker request failed"
  persist_json "$WORKER_BODY" "worker-poll-$attempt.json"

  if [ "$WORKER_STATUS" -lt 200 ] || [ "$WORKER_STATUS" -ge 300 ]; then
    cat "$WORKER_BODY"
    write_failure_summary "AUTONOMOUS_WORKER" "$WORKER_STATUS" "$WORKER_BODY"
    fail "autonomous worker returned HTTP $WORKER_STATUS"
  fi

  CONTROL_STATUS="$(
    curl -sS -o "$CONTROL_BODY" -w '%{http_code}' \
      -X GET "$APP_URL/api/creative/production/control?organization_id=$ORGANIZATION_ID&creative_project_id=$PROJECT_ID" \
      "${AUTH_HEADERS[@]}"
  )" || fail "production control request failed"
  persist_json "$CONTROL_BODY" "control-poll-$attempt.json"

  if [ "$CONTROL_STATUS" -lt 200 ] || [ "$CONTROL_STATUS" -ge 300 ]; then
    cat "$CONTROL_BODY"
    write_failure_summary "PRODUCTION_CONTROL" "$CONTROL_STATUS" "$CONTROL_BODY"
    fail "production control returned HTTP $CONTROL_STATUS"
  fi

  FAILED="$(jq -r '[.tasks[]? | select((.status // "") == "FAILED" or (.status // "") == "SKIPPED")] | length' "$CONTROL_BODY")"
  BLOCKED="$(jq -r '[.control.lifecycle.blockers[]?] | length' "$CONTROL_BODY")"
  LIFECYCLE="$(jq -r '.control.lifecycle.status // "UNKNOWN"' "$CONTROL_BODY")"
  TOTAL="$(jq -r '.control.tasks.total // (.tasks | length) // 0' "$CONTROL_BODY")"
  COMPLETED="$(jq -r '(.control.tasks.by_status.COMPLETED // 0) + (.control.tasks.by_status.APPROVED // 0)' "$CONTROL_BODY")"
  RELEASABLE="$(jq -r '.control.assets.releasable_deliverables // 0' "$CONTROL_BODY")"

  if [ "$FAILED" -gt 0 ]; then
    jq '{control:.control,tasks:[.tasks[] | select(.status == "FAILED" or .status == "SKIPPED")]}' "$CONTROL_BODY" > "$REPORT"
    cat "$REPORT"
    fail "one or more production tasks failed"
  fi

  if [ "$LIFECYCLE" = "RELEASE_READY" ] && [ "$TOTAL" -gt 0 ] && [ "$COMPLETED" -eq "$TOTAL" ] && [ "$RELEASABLE" -gt 0 ]; then
    jq -n \
      --slurpfile compose "$COMPOSE_BODY" \
      --slurpfile execute "$EXECUTE_BODY" \
      --slurpfile worker "$WORKER_BODY" \
      --slurpfile control "$CONTROL_BODY" \
      --arg project_id "$PROJECT_ID" \
      --arg evidence_directory "$ARTIFACT_DIR" \
      '{
        result:"PASS",
        mission:$compose[0].mission,
        project_id:$project_id,
        execute:$execute[0],
        worker:$worker[0],
        control:$control[0].control,
        tasks:$control[0].tasks,
        assets:$control[0].assets,
        evidence_directory:$evidence_directory
      }' > "$REPORT"

    echo "CREATIVE_END_TO_END_SMOKE=PASS"
    echo "MISSION_ID=$MISSION_ID"
    echo "PROJECT_ID=$PROJECT_ID"
    echo "PROJECT_TYPE=$PROJECT_TYPE"
    echo "TASKS=$TOTAL"
    echo "RELEASABLE_DELIVERABLES=$RELEASABLE"
    echo "REPORT=$REPORT"
    echo "EVIDENCE_DIRECTORY=$ARTIFACT_DIR"
    exit 0
  fi

  if [ "$BLOCKED" -gt 0 ] && [ "$LIFECYCLE" = "FAILED" ]; then
    jq '{control:.control,tasks:.tasks,assets:.assets}' "$CONTROL_BODY" > "$REPORT"
    cat "$REPORT"
    fail "production lifecycle failed"
  fi

  sleep "$POLL_SECONDS"
done

jq '{control:.control,tasks:.tasks,assets:.assets}' "$CONTROL_BODY" > "$REPORT"
cat "$REPORT"
fail "production did not reach RELEASE_READY within $MAX_POLLS polls"
