#!/usr/bin/env bash
set -e
set -o pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

APP_URL="${CREATIVE_REALITY_APP_URL:-http://localhost:3000}"
ORGANIZATION_ID="${CREATIVE_TEST_ORGANIZATION_ID:-}"
ENTITY_ID="${CREATIVE_TEST_ENTITY_ID:-}"
PERIOD_ID="${CREATIVE_TEST_PERIOD_ID:-}"
REQUEST_TEXT="${CREATIVE_TEST_REQUEST:-Create a world-class original nightclub campaign film using the real organization profile, approved locations and available reference assets. Build a cinematic multi-scene master video with atmosphere, bartender performance, lighting effects, music, sound design and channel cutdowns.}"
STAMP="$(date +%Y%m%d_%H%M%S)"
REPORT="${CREATIVE_LIVE_SMOKE_REPORT:-$ROOT/creative-live-mission-smoke-$STAMP.txt}"

exec > >(tee "$REPORT") 2>&1

if [ -z "$ORGANIZATION_ID" ]; then
  printf 'FAIL: CREATIVE_TEST_ORGANIZATION_ID is required\n'
  exit 1
fi

for command in curl node; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'FAIL: %s is required\n' "$command"
    exit 1
  fi
done

printf '============================================================\n'
printf 'AVANTIQO CREATIVE LIVE MISSION SMOKE\n'
printf '============================================================\n'
printf 'App URL: %s\n' "$APP_URL"
printf 'Organization: %s\n' "$ORGANIZATION_ID"
printf 'Started: %s\n' "$(date -Iseconds)"
printf 'Report: %s\n' "$REPORT"

HEALTH_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' "$APP_URL" || true)"
case "$HEALTH_STATUS" in
  200|301|302|307|308)
    printf 'PASS: application is reachable (%s)\n' "$HEALTH_STATUS"
    ;;
  *)
    printf 'FAIL: application is not reachable at %s (HTTP %s)\n' "$APP_URL" "$HEALTH_STATUS"
    exit 1
    ;;
esac

PAYLOAD_FILE="$(mktemp)"
RESPONSE_FILE="$(mktemp)"
trap 'rm -f "$PAYLOAD_FILE" "$RESPONSE_FILE"' EXIT

ORGANIZATION_ID="$ORGANIZATION_ID" \
ENTITY_ID="$ENTITY_ID" \
PERIOD_ID="$PERIOD_ID" \
REQUEST_TEXT="$REQUEST_TEXT" \
node > "$PAYLOAD_FILE" <<'NODE'
const payload = {
  organization_id: process.env.ORGANIZATION_ID,
  entity_id: process.env.ENTITY_ID || null,
  period_id: process.env.PERIOD_ID || null,
  request: process.env.REQUEST_TEXT,
};
process.stdout.write(JSON.stringify(payload));
NODE

CURL_ARGS=(
  -sS
  -o "$RESPONSE_FILE"
  -w '%{http_code}'
  -X POST
  "$APP_URL/api/creative/missions/compose"
  -H 'Content-Type: application/json'
  --data-binary "@$PAYLOAD_FILE"
)

if [ -n "${CREATIVE_TEST_BEARER_TOKEN:-}" ]; then
  CURL_ARGS+=( -H "Authorization: Bearer ${CREATIVE_TEST_BEARER_TOKEN}" )
fi

if [ -n "${CREATIVE_TEST_COOKIE:-}" ]; then
  CURL_ARGS+=( -H "Cookie: ${CREATIVE_TEST_COOKIE}" )
fi

HTTP_STATUS="$(curl "${CURL_ARGS[@]}" || true)"
cat "$RESPONSE_FILE"
printf '\nHTTP status: %s\n' "$HTTP_STATUS"

if [ "$HTTP_STATUS" != "200" ]; then
  printf 'FAIL: mission composition returned HTTP %s\n' "$HTTP_STATUS"
  exit 1
fi

node - "$RESPONSE_FILE" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const body = JSON.parse(fs.readFileSync(file, 'utf8'));
const projectCount = Array.isArray(body.blueprint?.deliverables)
  ? body.blueprint.deliverables.length
  : 0;

if (!body.success) throw new Error('success flag is false');
if (!body.mission?.id) throw new Error('mission id is missing');
if (!projectCount) throw new Error('no deliverables were produced');
if (!body.business_truth?.snapshot_id) throw new Error('business truth snapshot id is missing');
if (!body.business_truth?.payload_hash) throw new Error('business truth payload hash is missing');

console.log(`PASS: mission ${body.mission.id}`);
console.log(`PASS: deliverables ${projectCount}`);
console.log(`PASS: business truth snapshot ${body.business_truth.snapshot_id}`);
console.log(`PASS: business truth hash ${body.business_truth.payload_hash}`);
NODE

printf 'CREATIVE_LIVE_MISSION_SMOKE=PASS\n'
printf 'Finished: %s\n' "$(date -Iseconds)"
printf 'Report: %s\n' "$REPORT"
