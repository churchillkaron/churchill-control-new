#!/usr/bin/env bash
set -u
set -o pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT" || exit 1

STAMP="$(date +%Y%m%d_%H%M%S)"
APP_URL="${CREATIVE_TEST_APP_URL:-http://localhost:3000}"
REPORT="${CREATIVE_TEST_REPORT:-$ROOT/creative-full-scene-smoke-$STAMP.txt}"
BUNDLE_FILE="${CREATIVE_TEST_BUNDLE_FILE:-}"
EXECUTE_PAID="${CREATIVE_EXECUTE_PAID_MASTER_STILL:-0}"
FAILURES=0

exec > >(tee "$REPORT") 2>&1

section() {
  printf '\n============================================================\n'
  printf '%s\n' "$1"
  printf '============================================================\n'
}

pass() {
  printf 'PASS: %s\n' "$1"
}

fail() {
  FAILURES=$((FAILURES + 1))
  printf 'FAIL: %s\n' "$1"
}

require_command() {
  if command -v "$1" >/dev/null 2>&1; then
    pass "$1 available"
  else
    fail "$1 required"
  fi
}

request() {
  local endpoint="$1"
  local payload_file="$2"
  local output_file="$3"
  local auth_args=()

  if [ -n "${CREATIVE_TEST_BEARER_TOKEN:-}" ]; then
    auth_args=(-H "Authorization: Bearer ${CREATIVE_TEST_BEARER_TOKEN}")
  elif [ -n "${CREATIVE_TEST_COOKIE:-}" ]; then
    auth_args=(-H "Cookie: ${CREATIVE_TEST_COOKIE}")
  fi

  curl -sS \
    -X POST "$APP_URL$endpoint" \
    -H 'Content-Type: application/json' \
    "${auth_args[@]}" \
    --data-binary "@$payload_file" \
    -o "$output_file" \
    -w '%{http_code}'
}

validate_preflight() {
  node - "$1" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const body = JSON.parse(fs.readFileSync(file, 'utf8'));
const result = body.result || {};
const failures = [];
const assert = (value, message) => {
  if (!value) failures.push(message);
};

assert(body.success === true, `response success false: ${body.error || body.code || 'unknown'}`);
assert(result.success === true, 'preflight result unsuccessful');
assert(result.prepared_only === true, 'preflight was not preparation-only');
assert(result.full_scene_only === true, 'full_scene_only missing');
assert(result.composition_mode === 'FULL_SCENE_REFERENCE_SYNTHESIS', 'composition mode is not full-scene');
assert(result.masked_composition_allowed === false, 'masked composition remains allowed');
assert(result.provider_dispatched === false, 'provider dispatched during zero-spend preflight');
assert(result.usage_created === false, 'usage created during zero-spend preflight');
assert(result.wallet_reserved === false, 'wallet reserved during zero-spend preflight');
assert(result.wallet_charged === false, 'wallet charged during zero-spend preflight');
assert(Boolean(result.evidence_binding_hash), 'evidence binding hash missing');

for (const [name, task] of Object.entries({
  master_task: result.master_task || {},
  qa_task: result.qa_task || {},
})) {
  assert(Boolean(task.id), `${name} id missing`);
  assert(task.composition_mode === 'FULL_SCENE_REFERENCE_SYNTHESIS', `${name} not full-scene`);
  assert(task.evidence_binding_hash === result.evidence_binding_hash, `${name} evidence hash mismatch`);
  assert(task.provider_dispatched === false, `${name} provider already dispatched`);
  assert(task.usage_created === false, `${name} usage already created`);
  assert(task.wallet_reserved === false, `${name} wallet already reserved`);
  assert(Number(task.actual_cost || 0) === 0, `${name} already has actual cost`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(JSON.stringify({
  verdict: 'FULL_SCENE_ZERO_SPEND_PREFLIGHT_PASS',
  execution_plan_id: result.execution_plan_id,
  evidence_binding_hash: result.evidence_binding_hash,
  master_task_id: result.master_task.id,
  qa_task_id: result.qa_task.id,
  next_gate: result.next_gate,
}, null, 2));
NODE
}

validate_paid() {
  node - "$1" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const body = JSON.parse(fs.readFileSync(file, 'utf8'));
const result = body.result || {};
const review = result.quality_review || {};
const authorization = review.authorization || {};
const failures = [];
const assert = (value, message) => {
  if (!value) failures.push(message);
};

assert(body.success === true, `response success false: ${body.error || body.code || 'unknown'}`);
assert(result.success === true, 'paid master still execution unsuccessful');
assert(result.full_scene_only === true, 'paid result is not full-scene only');
assert(result.composition_mode === 'FULL_SCENE_REFERENCE_SYNTHESIS', 'paid result composition mode invalid');
assert(result.masked_composition_allowed === false, 'masked composition allowed in paid result');
assert(result.paid_execution_explicitly_confirmed === true, 'paid confirmation missing');
assert(result.image_generation_limit === 1, 'image generation limit is not one');
assert(result.video_generation_allowed === false, 'video generation allowed');
assert(Number(result.video_tasks_materialized || 0) === 0, 'video tasks materialized');
assert(Number(result.video_tasks_dispatched || 0) === 0, 'video tasks dispatched');
assert(Boolean(result.master_still?.authorization?.id), 'master still task missing');
assert(Boolean(authorization.id), 'QA task missing');
assert(authorization.composition_mode === 'FULL_SCENE_REFERENCE_SYNTHESIS', 'QA task full-scene lock missing');

const passed = review.passed === true;
const score = Number(review.overall_score || 0);
const minimum = Number(review.minimum_score || 90);
const critical = Array.isArray(review.critical_failures)
  ? review.critical_failures
  : [];
assert(passed, 'strict visual QA did not pass');
assert(score >= minimum, `QA score ${score} below ${minimum}`);
assert(critical.length === 0, `critical QA failures: ${critical.join(', ')}`);

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(JSON.stringify({
  verdict: 'ONE_FULL_SCENE_MASTER_STILL_AND_QA_PASS',
  master_task_id: result.master_still.authorization.id,
  qa_task_id: authorization.id,
  quality_score: score,
  minimum_score: minimum,
  next_gate: result.next_gate,
  video_tasks_materialized: result.video_tasks_materialized,
  video_tasks_dispatched: result.video_tasks_dispatched,
}, null, 2));
NODE
}

section "AVANTIQO FULL-SCENE MASTER STILL SMOKE"
printf 'Application: %s\n' "$APP_URL"
printf 'Bundle: %s\n' "${BUNDLE_FILE:-NOT_SET}"
printf 'Paid execution: %s\n' "$EXECUTE_PAID"
printf 'Report: %s\n' "$REPORT"
printf 'Started: %s\n' "$(date -Iseconds)"

section "TOOLCHAIN"
require_command curl
require_command node

if [ "$FAILURES" -gt 0 ]; then
  exit 1
fi

section "INPUT CONTRACT"
if [ -z "$BUNDLE_FILE" ]; then
  fail "set CREATIVE_TEST_BUNDLE_FILE to a JSON bundle"
elif [ ! -f "$BUNDLE_FILE" ]; then
  fail "bundle file does not exist: $BUNDLE_FILE"
elif node - "$BUNDLE_FILE" <<'NODE'
const fs = require('fs');
const body = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const required = [
  'organization_id',
  'creative_project_id',
  'approval_candidate',
  'proof_authorization',
  'authorized_preparation',
];
const missing = required.filter((key) => !body[key]);
if (missing.length) {
  console.error(`missing: ${missing.join(', ')}`);
  process.exit(1);
}
if (body.accept_paid_execution === true || body.explicit_confirmation) {
  console.error('bundle must not embed paid execution acceptance or confirmation');
  process.exit(2);
}
console.log(JSON.stringify({
  organization_id: body.organization_id,
  creative_project_id: body.creative_project_id,
  proof_shot: body.proof_authorization?.proof_shot || null,
}, null, 2));
NODE
then
  pass "bundle contains the approved story, authorization and preparation"
else
  fail "bundle contract invalid"
fi

if [ "$FAILURES" -gt 0 ]; then
  exit 1
fi

PREFLIGHT_PAYLOAD="$(mktemp)"
PREFLIGHT_RESPONSE="$(mktemp)"
PAID_PAYLOAD="$(mktemp)"
PAID_RESPONSE="$(mktemp)"
trap 'rm -f "$PREFLIGHT_PAYLOAD" "$PREFLIGHT_RESPONSE" "$PAID_PAYLOAD" "$PAID_RESPONSE"' EXIT

node - "$BUNDLE_FILE" "$PREFLIGHT_PAYLOAD" <<'NODE'
const fs = require('fs');
const source = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const payload = {
  organization_id: source.organization_id,
  creative_project_id: source.creative_project_id,
  approval_candidate: source.approval_candidate,
  proof_authorization: source.proof_authorization,
  authorized_preparation: source.authorized_preparation,
};
fs.writeFileSync(process.argv[3], JSON.stringify(payload));
NODE

section "ZERO-SPEND FULL-SCENE PREFLIGHT"
PREFLIGHT_STATUS="$(request \
  '/api/creative/production/authorized-full-scene-preflight' \
  "$PREFLIGHT_PAYLOAD" \
  "$PREFLIGHT_RESPONSE" || true)"
cat "$PREFLIGHT_RESPONSE"
printf '\nHTTP status: %s\n' "$PREFLIGHT_STATUS"

if [ "$PREFLIGHT_STATUS" = "200" ] && validate_preflight "$PREFLIGHT_RESPONSE"; then
  pass "full-scene task and QA binding verified without provider spend"
else
  fail "full-scene zero-spend preflight failed"
fi

if [ "$FAILURES" -gt 0 ]; then
  section "RESULT"
  printf 'CREATIVE_FULL_SCENE_SMOKE=FAIL\n'
  printf 'Report: %s\n' "$REPORT"
  exit 1
fi

if [ "$EXECUTE_PAID" != "1" ]; then
  section "RESULT"
  pass "preflight complete; paid generation intentionally skipped"
  printf 'Set CREATIVE_EXECUTE_PAID_MASTER_STILL=1 to generate exactly one full-scene master still and run strict QA.\n'
  printf 'CREATIVE_FULL_SCENE_SMOKE=PREFLIGHT_PASS\n'
  printf 'Report: %s\n' "$REPORT"
  exit 0
fi

section "EXPLICIT ONE-IMAGE PAID EXECUTION"
node - "$BUNDLE_FILE" "$PAID_PAYLOAD" <<'NODE'
const fs = require('fs');
const source = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const payload = {
  organization_id: source.organization_id,
  creative_project_id: source.creative_project_id,
  approval_candidate: source.approval_candidate,
  proof_authorization: source.proof_authorization,
  authorized_preparation: source.authorized_preparation,
  explicit_confirmation: 'GENERATE_AUTHORIZED_MASTER_STILL_PROOF',
  accept_paid_execution: true,
};
fs.writeFileSync(process.argv[3], JSON.stringify(payload));
NODE

PAID_STATUS="$(request \
  '/api/creative/production/authorized-master-still-generation' \
  "$PAID_PAYLOAD" \
  "$PAID_RESPONSE" || true)"
cat "$PAID_RESPONSE"
printf '\nHTTP status: %s\n' "$PAID_STATUS"

if [ "$PAID_STATUS" = "200" ] && validate_paid "$PAID_RESPONSE"; then
  pass "one full-scene master still generated and strict QA passed"
else
  fail "paid full-scene master still smoke failed"
fi

section "RESULT"
printf 'Failures: %s\n' "$FAILURES"
printf 'Finished: %s\n' "$(date -Iseconds)"
printf 'Report: %s\n' "$REPORT"

if [ "$FAILURES" -gt 0 ]; then
  printf 'CREATIVE_FULL_SCENE_SMOKE=FAIL\n'
  exit 1
fi

printf 'CREATIVE_FULL_SCENE_SMOKE=PASS\n'
exit 0
