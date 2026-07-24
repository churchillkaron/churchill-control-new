#!/usr/bin/env bash
set -u
set -o pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT" || exit 1

STAMP="$(date +%Y%m%d_%H%M%S)"
APP_URL="${CREATIVE_TEST_APP_URL:-http://localhost:3000}"
ORGANIZATION_ID="${CREATIVE_TEST_ORGANIZATION_ID:-}"
ENTITY_ID="${CREATIVE_TEST_ENTITY_ID:-}"
PERIOD_ID="${CREATIVE_TEST_PERIOD_ID:-}"
OBJECTIVE="${CREATIVE_TEST_OBJECTIVE:-Create an original world-class cinematic advertising film for this organization. Research the business from its connected data and approved assets, invent the complete story, direct every scene and shot, and prepare one evidence-grounded full-scene master still as the production proof.}"
DURATION="${CREATIVE_TEST_DURATION_SECONDS:-30}"
EXECUTE_PAID="${CREATIVE_EXECUTE_PAID_MASTER_STILL:-0}"
REPORT="${CREATIVE_TEST_REPORT:-$ROOT/creative-greenfield-full-scene-$STAMP.txt}"
RESPONSE_FILE="$(mktemp)"
PAYLOAD_FILE="$(mktemp)"
FAILURES=0

trap 'rm -f "$RESPONSE_FILE" "$PAYLOAD_FILE"' EXIT
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

section "AVANTIQO AUTONOMOUS GREENFIELD CREATIVE TEST"
printf 'Application: %s\n' "$APP_URL"
printf 'Organization: %s\n' "${ORGANIZATION_ID:-NOT_SET}"
printf 'Objective: %s\n' "$OBJECTIVE"
printf 'Duration: %s seconds\n' "$DURATION"
printf 'Paid master still: %s\n' "$EXECUTE_PAID"
printf 'Report: %s\n' "$REPORT"
printf 'Started: %s\n' "$(date -Iseconds)"

section "TOOLCHAIN"
require_command curl
require_command node

if [ -z "$ORGANIZATION_ID" ]; then
  fail "set CREATIVE_TEST_ORGANIZATION_ID"
fi

if [ "$EXECUTE_PAID" != "0" ] && [ "$EXECUTE_PAID" != "1" ]; then
  fail "CREATIVE_EXECUTE_PAID_MASTER_STILL must be 0 or 1"
fi

if [ "$FAILURES" -gt 0 ]; then
  exit 1
fi

node - "$PAYLOAD_FILE" <<'NODE'
const fs = require('fs');
const duration = Number(process.env.CREATIVE_TEST_DURATION_SECONDS || 30);
const paid = process.env.CREATIVE_EXECUTE_PAID_MASTER_STILL === '1';
const payload = {
  organization_id: process.env.CREATIVE_TEST_ORGANIZATION_ID,
  entity_id: process.env.CREATIVE_TEST_ENTITY_ID || null,
  period_id: process.env.CREATIVE_TEST_PERIOD_ID || null,
  objective: process.env.CREATIVE_TEST_OBJECTIVE ||
    'Create an original world-class cinematic advertising film for this organization. Research the business from its connected data and approved assets, invent the complete story, direct every scene and shot, and prepare one evidence-grounded full-scene master still as the production proof.',
  duration_seconds: Number.isFinite(duration) && duration > 0 ? duration : 30,
  execute_paid_master_still: paid,
  accept_paid_execution: paid,
};
fs.writeFileSync(process.argv[2], JSON.stringify(payload));
NODE

section "GREENFIELD EXECUTION"
printf '%s\n' "Avantiqo will create a new mission and project, hydrate business truth, invent the story, run director repairs and final audit, select the proof shot, bind evidence, and prepare the full-scene master still."

if [ -n "${CREATIVE_TEST_BEARER_TOKEN:-}" ]; then
  pass "optional bearer authentication configured"
  HTTP_STATUS="$(curl -sS \
    -X POST "$APP_URL/api/creative/production/autonomous-greenfield-proof" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer ${CREATIVE_TEST_BEARER_TOKEN}" \
    --data-binary "@$PAYLOAD_FILE" \
    -o "$RESPONSE_FILE" \
    -w '%{http_code}' || true)"
elif [ -n "${CREATIVE_TEST_COOKIE:-}" ]; then
  pass "optional cookie authentication configured"
  HTTP_STATUS="$(curl -sS \
    -X POST "$APP_URL/api/creative/production/autonomous-greenfield-proof" \
    -H 'Content-Type: application/json' \
    -H "Cookie: ${CREATIVE_TEST_COOKIE}" \
    --data-binary "@$PAYLOAD_FILE" \
    -o "$RESPONSE_FILE" \
    -w '%{http_code}' || true)"
else
  pass "local organization-scoped execution requires no bearer token"
  HTTP_STATUS="$(curl -sS \
    -X POST "$APP_URL/api/creative/production/autonomous-greenfield-proof" \
    -H 'Content-Type: application/json' \
    --data-binary "@$PAYLOAD_FILE" \
    -o "$RESPONSE_FILE" \
    -w '%{http_code}' || true)"
fi

cat "$RESPONSE_FILE"
printf '\nHTTP status: %s\n' "$HTTP_STATUS"

section "REALITY VALIDATION"
if [ "$HTTP_STATUS" != "200" ]; then
  fail "greenfield endpoint returned HTTP $HTTP_STATUS"
else
  if node - "$RESPONSE_FILE" <<'NODE'
const fs = require('fs');
const body = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const proof = body.proof || {};
const preflight = proof.full_scene_preflight || {};
const paid = proof.paid_execution || null;
const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

assert(body.success === true, `response unsuccessful: ${body.error || body.code || 'unknown'}`);
assert(body.greenfield_test === true, 'greenfield marker missing');
assert(body.mission_created === true && Boolean(body.mission?.id), 'new mission not created');
assert(body.project_created === true && Boolean(body.project?.id), 'new master project not created');
assert(body.business_truth?.snapshot_id, 'business-truth snapshot missing');
assert(body.director_completed === true, 'director did not complete');
assert(body.final_story_audit_passed === true, 'final story audit did not pass');
assert(body.director?.verdict?.plan_only_canary_passed === true, 'director canary failed');
assert(body.director?.verdict?.final_failure_count === 0, 'director final audit contains failures');
assert(proof.autonomous_story_created === true, 'story was not autonomously created');
assert(Number(proof.story_scene_count || 0) > 0, 'story has no scenes');
assert(Number(proof.story_shot_count || 0) > 0, 'story has no shots');
assert(Boolean(proof.selected_proof_shot?.key), 'proof shot was not selected');
assert((proof.selected_proof_shot?.reference_asset_ids || []).length > 0, 'proof shot has no references');
assert(Boolean(proof.approval_candidate_hash), 'approval candidate hash missing');
assert(Boolean(proof.proof_authorization?.authorization_hash), 'proof authorization missing');
assert(Boolean(proof.authorized_preparation?.preparation?.execution_plan?.id), 'authorized preparation missing');
assert(Boolean(proof.evidence_audit?.evidence_role_manifest), 'evidence audit missing');
assert(Boolean(proof.final_full_scene_binding?.binding_hash), 'full-scene evidence binding missing');
assert(proof.final_full_scene_binding?.composition_plan?.mode === 'FULL_SCENE_REFERENCE_SYNTHESIS', 'binding is not full-scene');
assert(body.masked_composition_allowed === false, 'masked composition remains allowed');
assert(preflight.success === true && preflight.prepared_only === true, 'full-scene zero-spend preflight failed');
assert(preflight.composition_mode === 'FULL_SCENE_REFERENCE_SYNTHESIS', 'preflight composition mode invalid');
assert(Number(preflight.video_tasks_materialized || 0) === 0, 'video tasks materialized during proof preflight');
assert(Number(preflight.video_tasks_dispatched || 0) === 0, 'video tasks dispatched during proof preflight');

if (process.env.CREATIVE_EXECUTE_PAID_MASTER_STILL === '1') {
  assert(body.paid_execution_started === true, 'paid execution was requested but not started');
  assert(Boolean(paid), 'paid execution result missing');
  assert(paid.success === true, 'paid master still failed');
  assert(paid.full_scene_only === true, 'paid output is not full-scene only');
  assert(paid.composition_mode === 'FULL_SCENE_REFERENCE_SYNTHESIS', 'paid composition mode invalid');
  assert(Number(paid.video_tasks_materialized || 0) === 0, 'video tasks materialized during paid proof');
  assert(Number(paid.video_tasks_dispatched || 0) === 0, 'video tasks dispatched during paid proof');
  const qa = paid.quality_review || {};
  assert(qa.passed === true, 'strict image QA did not pass');
  assert(Number(qa.overall_score || 0) >= Number(qa.minimum_score || 90), 'strict QA score below minimum');
  assert((qa.critical_failures || []).length === 0, 'critical QA failures remain');
} else {
  assert(body.paid_execution_started === false, 'provider spend started during zero-spend test');
  assert(paid === null, 'paid execution object exists during zero-spend test');
  assert(preflight.provider_dispatched === false, 'provider dispatched during zero-spend preflight');
  assert(preflight.wallet_reserved === false, 'wallet reserved during zero-spend preflight');
  assert(preflight.usage_created === false, 'usage created during zero-spend preflight');
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(JSON.stringify({
  verdict: process.env.CREATIVE_EXECUTE_PAID_MASTER_STILL === '1'
    ? 'AUTONOMOUS_GREENFIELD_FULL_SCENE_MASTER_STILL_PASS'
    : 'AUTONOMOUS_GREENFIELD_ZERO_SPEND_PREFLIGHT_PASS',
  mission_id: body.mission.id,
  project_id: body.project.id,
  director_job_id: body.director.job_id,
  scene_count: proof.story_scene_count,
  shot_count: proof.story_shot_count,
  selected_proof_shot: proof.selected_proof_shot,
  evidence_binding_hash: proof.final_full_scene_binding.binding_hash,
  master_task_id: preflight.master_task?.id || null,
  qa_task_id: preflight.qa_task?.id || null,
  paid_execution_started: body.paid_execution_started,
  qa_score: paid?.quality_review?.overall_score || null,
  next_gate: proof.next_gate,
}, null, 2));
NODE
  then
    pass "autonomous greenfield chain passed"
  else
    fail "autonomous greenfield chain failed validation"
  fi
fi

section "RESULT"
printf 'Failures: %s\n' "$FAILURES"
printf 'Finished: %s\n' "$(date -Iseconds)"
printf 'Report: %s\n' "$REPORT"

if [ "$FAILURES" -gt 0 ]; then
  printf 'CREATIVE_GREENFIELD_REALITY_TEST=FAIL\n'
  exit 1
fi

if [ "$EXECUTE_PAID" = "1" ]; then
  printf 'CREATIVE_GREENFIELD_REALITY_TEST=FULL_SCENE_MASTER_STILL_PASS\n'
else
  printf 'CREATIVE_GREENFIELD_REALITY_TEST=ZERO_SPEND_PREFLIGHT_PASS\n'
  printf 'To generate exactly one full-scene master still, rerun with CREATIVE_EXECUTE_PAID_MASTER_STILL=1.\n'
fi

exit 0
