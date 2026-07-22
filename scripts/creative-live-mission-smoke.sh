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
printf 'Started: %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')"
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
const blueprint = body.blueprint || {};
const deliverables = Array.isArray(blueprint.deliverables)
  ? blueprint.deliverables
  : [];
const workflow = Array.isArray(blueprint.workflow)
  ? blueprint.workflow
  : [];
const sourceFailures = Array.isArray(body.business_truth?.source_failures)
  ? body.business_truth.source_failures
  : [];

function fail(message) {
  throw new Error(message);
}

function identity(deliverable = {}) {
  return `${deliverable.id || ''} ${deliverable.title || ''}`.toLowerCase();
}

function hasToken(text, token) {
  return new RegExp(`(?:^|[^a-z0-9])${token}(?:[^a-z0-9]|$)`, 'i').test(text);
}

if (!body.success) fail('success flag is false');
if (!body.mission?.id) fail('mission id is missing');
if (!deliverables.length) fail('no deliverables were produced');
if (!body.business_truth?.snapshot_id) fail('business truth snapshot id is missing');
if (!body.business_truth?.payload_hash) fail('business truth payload hash is missing');
if (sourceFailures.length) fail(`business truth has ${sourceFailures.length} source failure(s)`);
if (blueprint.composition_source !== 'AI_DIRECTOR') fail('AI Director was not used');
if (blueprint.fallback_reason) fail(`AI Director fallback: ${blueprint.fallback_reason}`);
if (Number(blueprint.confidence || 0) < 70) fail('AI Director confidence is below 70');
if (blueprint.production_mode !== 'AI_NATIVE') fail(`production mode is ${blueprint.production_mode || 'missing'}, expected AI_NATIVE`);
if (!blueprint.quality_policy || Array.isArray(blueprint.quality_policy) || typeof blueprint.quality_policy !== 'object') {
  fail('quality policy is not a structured object');
}
if (blueprint.quality_policy.regenerate_when_below_standard !== true) {
  fail('quality policy does not require regeneration below standard');
}
if (blueprint.quality_policy.full_output_review_required !== true) {
  fail('quality policy does not require full-output review');
}

const expectedWorkspaces = [
  'mission', 'brief', 'research', 'strategy', 'concept', 'assets',
  'storyboard', 'production', 'timeline', 'documents', 'render',
  'publishing', 'learning',
];
const actualWorkspaces = workflow.map((item) => item.workspace_id);
const uniqueWorkspaces = new Set(actualWorkspaces);
if (uniqueWorkspaces.size !== actualWorkspaces.length) fail('workflow contains duplicate workspaces');
for (const workspace of expectedWorkspaces) {
  if (!uniqueWorkspaces.has(workspace)) fail(`workflow is missing ${workspace}`);
}
for (const item of workflow) {
  if (!item.title || !item.description) fail(`workflow ${item.workspace_id} is incomplete`);
}

for (const [index, deliverable] of deliverables.entries()) {
  const label = `deliverable ${index + 1}`;
  if (!deliverable.title || /^(?:creative\s+)?(?:deliverable|output)\s*\d*$/i.test(deliverable.title)) fail(`${label} has a generic title`);
  if (!deliverable.description) fail(`${label} has no description`);
  if (!deliverable.medium || String(deliverable.medium).toUpperCase() === 'OPEN') fail(`${label} has no concrete medium`);
  if (!Array.isArray(deliverable.formats) || !deliverable.formats.length) fail(`${label} has no formats`);
  if (!Array.isArray(deliverable.channels) || !deliverable.channels.length) fail(`${label} has no channels`);
  if (!Array.isArray(deliverable.execution_capabilities) || !deliverable.execution_capabilities.length) {
    fail(`${label} has no canonical execution capabilities`);
  }
  if (deliverable.execution_capabilities.some((capability) => !String(capability).includes('.'))) {
    fail(`${label} has noncanonical execution capabilities`);
  }
  if (!Array.isArray(deliverable.success_criteria) || !deliverable.success_criteria.length) {
    fail(`${label} has no success criteria`);
  }
  if (!deliverable.specifications || typeof deliverable.specifications !== 'object' || Array.isArray(deliverable.specifications)) {
    fail(`${label} specifications are invalid`);
  }

  const itemIdentity = identity(deliverable);
  const medium = String(deliverable.medium).toUpperCase();
  const capabilities = new Set(deliverable.execution_capabilities || []);
  const videoShaped =
    hasToken(itemIdentity, 'film') ||
    hasToken(itemIdentity, 'video') ||
    hasToken(itemIdentity, 'cutdown') ||
    hasToken(itemIdentity, 'reel') ||
    hasToken(itemIdentity, 'short') ||
    hasToken(itemIdentity, 'trailer') ||
    hasToken(itemIdentity, 'episode');
  const imageShaped =
    hasToken(itemIdentity, 'still') ||
    hasToken(itemIdentity, 'stills') ||
    hasToken(itemIdentity, 'keyframe') ||
    hasToken(itemIdentity, 'keyframes') ||
    /key art|approval frame/.test(itemIdentity);
  const multimediaShaped =
    /typograph|endcard|motion graphic/.test(itemIdentity);
  const audioShaped =
    !videoShaped &&
    !multimediaShaped &&
    (
      hasToken(itemIdentity, 'sound') ||
      hasToken(itemIdentity, 'audio') ||
      hasToken(itemIdentity, 'music') ||
      hasToken(itemIdentity, 'stem')
    );

  if (videoShaped && medium !== 'FILM') {
    fail(`${deliverable.title} is video-shaped but classified as ${medium}`);
  }
  if (imageShaped && medium !== 'IMAGE') {
    fail(`${deliverable.title} is image-shaped but classified as ${medium}`);
  }
  if (audioShaped && medium !== 'AUDIO') {
    fail(`${deliverable.title} is audio-shaped but classified as ${medium}`);
  }
  if (multimediaShaped && medium !== 'MULTIMEDIA') {
    fail(`${deliverable.title} is multimedia-shaped but classified as ${medium}`);
  }
  if (medium === 'FILM' && !capabilities.has('ai.video.image_to_video') && !capabilities.has('ai.video.generate')) {
    fail(`${deliverable.title} has no video generation capability`);
  }
  if (medium === 'IMAGE' && capabilities.has('ai.video.image_to_video')) {
    fail(`${deliverable.title} image deliverable unexpectedly requires video generation`);
  }
}

const filmDeliverables = deliverables.filter((deliverable) => String(deliverable.medium).toUpperCase() === 'FILM');
if (!filmDeliverables.length) fail('no film/video deliverable was produced');
for (const deliverable of filmDeliverables) {
  const capabilities = new Set(deliverable.execution_capabilities || []);
  if (!capabilities.has('ai.video.image_to_video') && !capabilities.has('ai.video.generate')) {
    fail(`${deliverable.title} has no video generation capability`);
  }
  if (!capabilities.has('ai.image.generate')) fail(`${deliverable.title} has no master-still generation capability`);
  if (!capabilities.has('ai.image.analyze')) fail(`${deliverable.title} has no visual QA capability`);
  if (!capabilities.has('ai.music.generate')) fail(`${deliverable.title} has no music capability`);
  if (!capabilities.has('ai.sfx.generate')) fail(`${deliverable.title} has no sound-effects capability`);
}

const requiredProductionPath = {
  title: blueprint.title,
  business_goal: blueprint.business_goal,
  objective: blueprint.objective,
  creative_thesis: blueprint.creative_thesis,
  assumptions: blueprint.assumptions,
  blocking_questions: blueprint.blocking_questions,
  production_principles: blueprint.production_principles,
  workflow,
  deliverables: deliverables.map((deliverable) => ({
    id: deliverable.id,
    title: deliverable.title,
    description: deliverable.description,
    medium: deliverable.medium,
    dependencies: deliverable.dependencies,
    specifications: deliverable.specifications,
  })),
};
const requiredText = JSON.stringify(requiredProductionPath).toLowerCase();
const forbiddenPhysicalDependencies = [
  'principal photography',
  'two-night shoot',
  'two night shoot',
  'actors to be cast',
  'external production crew',
  'fire marshal',
  'fire marshals',
  'location permit',
  'venue closure',
];
for (const phrase of forbiddenPhysicalDependencies) {
  if (requiredText.includes(phrase)) {
    fail(`AI-native required path contains unsupported physical dependency: ${phrase}`);
  }
}

console.log(`PASS: mission ${body.mission.id}`);
console.log(`PASS: AI Director confidence ${blueprint.confidence}`);
console.log(`PASS: production mode ${blueprint.production_mode}`);
console.log(`PASS: deliverables ${deliverables.length}`);
console.log('PASS: semantic deliverable classification');
console.log('PASS: optional real-world extensions isolated from required production');
console.log(`PASS: workflow ${workflow.length} canonical stages`);
console.log(`PASS: business truth snapshot ${body.business_truth.snapshot_id}`);
console.log(`PASS: business truth hash ${body.business_truth.payload_hash}`);
console.log('PASS: business truth source failures 0');
console.log('PASS: AI-native production contract');
NODE

printf 'CREATIVE_LIVE_MISSION_SMOKE=PASS\n'
printf 'Finished: %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')"
printf 'Report: %s\n' "$REPORT"
