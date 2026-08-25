#!/usr/bin/env bash

set -u

PROJECT_ROOT="${AVANTIQO_PROJECT_ROOT:-$HOME/Projects/churchill-control-new}"
PORT="${AVANTIQO_OPERATOR_E2E_PORT:-3017}"
BASE_URL="${AVANTIQO_OPERATOR_E2E_BASE_URL:-http://127.0.0.1:${PORT}}"
STAMP="$(date +%Y%m%d_%H%M%S)"
CONVERSATION_KEY="operator-product-engineering-e2e-${STAMP}"
SESSION_FILE="$(mktemp)"
BOOTSTRAP_FILE="$(mktemp)"
TURN_FILE="$(mktemp)"
SERVER_LOG="/tmp/AVANTIQO_OPERATOR_PRODUCT_E2E_SERVER_${STAMP}.log"
REPORT="/tmp/AVANTIQO_OPERATOR_PRODUCT_ENGINEERING_E2E_${STAMP}.json"
E2E_DIST_DIR=".next-operator-product-e2e-${STAMP}"
STARTED_SERVER_PID=""

cleanup() {
  if [ -n "$STARTED_SERVER_PID" ]; then
    kill "$STARTED_SERVER_PID" 2>/dev/null || true
    wait "$STARTED_SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$PROJECT_ROOT/$E2E_DIST_DIR" 2>/dev/null || true
  rm -f "$SESSION_FILE" "$BOOTSTRAP_FILE" "$TURN_FILE"
  unset FINANCE_SMOKE_PASSWORD FINANCE_SMOKE_EMAIL 2>/dev/null || true
}
trap cleanup EXIT INT TERM

fail() {
  echo ""
  echo "E2E_RESULT=FAIL"
  echo "E2E_REASON=$1"
  echo "REPORT=$REPORT"
  [ -f "$SERVER_LOG" ] && echo "SERVER_LOG=$SERVER_LOG"
  exit 1
}

json_value() {
  node - "$1" "$2" <<'NODE'
const fs = require("fs");
const data = JSON.parse(fs.readFileSync(process.argv[2], "utf8") || "{}");
const value = process.argv[3].split(".").filter(Boolean).reduce((current, part) => current?.[part], data);
if (value !== undefined && value !== null) process.stdout.write(String(value));
NODE
}

http_status() {
  curl --silent --max-time 4 --output /dev/null --write-out '%{http_code}' "$1" 2>/dev/null || true
}

wait_for_server() {
  local attempts=0
  local status=""
  while [ "$attempts" -lt 90 ]; do
    status="$(http_status "$BASE_URL")"
    if [ -n "$status" ] && [ "$status" != "000" ]; then
      echo "LOCAL_SERVER_STATUS=$status"
      return 0
    fi
    sleep 1
    attempts=$((attempts + 1))
  done
  return 1
}

echo "============================================================"
echo "AVANTIQO OPERATOR PRODUCT ENGINEERING REAL LOCAL E2E"
echo "============================================================"
echo "Project:      $PROJECT_ROOT"
echo "Base URL:     $BASE_URL"
echo "Conversation: $CONVERSATION_KEY"
echo "Report:       $REPORT"
echo ""

cd "$PROJECT_ROOT" || fail "PROJECT_DIRECTORY_NOT_FOUND"
command -v node >/dev/null 2>&1 || fail "NODE_MISSING"
command -v curl >/dev/null 2>&1 || fail "CURL_MISSING"
command -v git >/dev/null 2>&1 || fail "GIT_MISSING"

if [ -n "$(git status --porcelain)" ]; then
  git status --short
  fail "WORKING_TREE_NOT_CLEAN"
fi

echo "================ SYNC NEWEST MAIN ================"
git fetch origin main || fail "GIT_FETCH_MAIN_FAILED"
git switch main || fail "GIT_SWITCH_MAIN_FAILED"
git pull --ff-only origin main || fail "GIT_PULL_MAIN_FAILED"
MAIN_BEFORE="$(git rev-parse HEAD)"
echo "MAIN_BEFORE=$MAIN_BEFORE"

[ -f scripts/create-finance-smoke-session.mjs ] || fail "AUTH_SESSION_HELPER_MISSING"
[ -f app/api/operator/turn/route.js ] || fail "OPERATOR_TURN_ROUTE_MISSING"
[ -f lib/platform/capabilities/createProductEngineeringCycleCapability.js ] || fail "PRODUCT_ENGINEERING_CYCLE_CAPABILITY_MISSING"

EXISTING_STATUS="$(http_status "$BASE_URL")"
if [ -n "$EXISTING_STATUS" ] && [ "$EXISTING_STATUS" != "000" ]; then
  echo "LOCAL_SERVER_REUSED=YES"
  echo "LOCAL_SERVER_STATUS=$EXISTING_STATUS"
else
  echo "LOCAL_SERVER_REUSED=NO"
  echo "STARTING_ISOLATED_LOCAL_SERVER=YES"
  AVANTIQO_NEXT_DIST_DIR="$E2E_DIST_DIR" ./node_modules/.bin/next dev -p "$PORT" >"$SERVER_LOG" 2>&1 &
  STARTED_SERVER_PID=$!
  wait_for_server || {
    tail -n 80 "$SERVER_LOG" 2>/dev/null || true
    fail "LOCAL_SERVER_START_FAILED"
  }
fi

echo ""
echo "================ AUTHENTICATE ================"
if [ -z "${FINANCE_SMOKE_EMAIL:-}" ]; then
  printf "Avantiqo login email: "
  IFS= read -r FINANCE_SMOKE_EMAIL
fi
if [ -z "${FINANCE_SMOKE_PASSWORD:-}" ]; then
  printf "Avantiqo login password: "
  IFS= read -r -s FINANCE_SMOKE_PASSWORD
  echo ""
fi
export FINANCE_SMOKE_EMAIL FINANCE_SMOKE_PASSWORD

node scripts/create-finance-smoke-session.mjs > "$SESSION_FILE" || fail "AUTHENTICATION_FAILED"
COOKIE_HEADER="$(json_value "$SESSION_FILE" cookieHeader)"
USER_ID="$(json_value "$SESSION_FILE" userId)"
USER_EMAIL="$(json_value "$SESSION_FILE" userEmail)"
[ -n "$COOKIE_HEADER" ] || fail "SESSION_COOKIE_MISSING"
[ -n "$USER_ID" ] || fail "AUTHENTICATED_USER_MISSING"
echo "AUTHENTICATED_USER=$USER_EMAIL"

echo ""
echo "================ BOOTSTRAP REAL BUSINESS CONTEXT ================"
BOOTSTRAP_STATUS="$({
  curl --silent --show-error --max-time 30 \
    --output "$BOOTSTRAP_FILE" --write-out '%{http_code}' \
    --header "Cookie: $COOKIE_HEADER" \
    "$BASE_URL/api/session/bootstrap"
})"
if [ "$BOOTSTRAP_STATUS" != "200" ]; then
  cat "$BOOTSTRAP_FILE"
  fail "BUSINESS_CONTEXT_BOOTSTRAP_FAILED_HTTP_${BOOTSTRAP_STATUS}"
fi

ORGANIZATION_ID="$(json_value "$BOOTSTRAP_FILE" organization_id)"
ENTITY_ID="$(json_value "$BOOTSTRAP_FILE" entity_id)"
PERIOD_ID="$(json_value "$BOOTSTRAP_FILE" period_id)"
ROLE="$(json_value "$BOOTSTRAP_FILE" role)"
[ -n "$ORGANIZATION_ID" ] || fail "BOOTSTRAP_ORGANIZATION_ID_MISSING"
echo "ORGANIZATION_ID=$ORGANIZATION_ID"
echo "ENTITY_ID=${ENTITY_ID:-NONE}"
echo "PERIOD_ID=${PERIOD_ID:-NONE}"
echo "ROLE=${ROLE:-UNKNOWN}"

echo ""
echo "================ REAL NATURAL-LANGUAGE PRODUCT TURN ================"
MESSAGE="Continue building Avantiqo end to end. Inspect actual current main, choose the single highest-impact repository-grounded product engineering gap, let Avantiqo Code AI implement it locally, run the required checks, repair failures, and satisfy every Product completion criterion with observed evidence. Then let Product Intelligence decide persistence. This is a local development test: do not commit, deploy production, publish, or run database migrations. Stop after the persistence decision or a prepared commit confirmation."

REQUEST_BODY="$(
  ORGANIZATION_ID="$ORGANIZATION_ID" \
  ENTITY_ID="$ENTITY_ID" \
  PERIOD_ID="$PERIOD_ID" \
  CONVERSATION_KEY="$CONVERSATION_KEY" \
  MESSAGE="$MESSAGE" \
  node <<'NODE'
const body = {
  organization_id: process.env.ORGANIZATION_ID,
  message: process.env.MESSAGE,
  source: "text",
  conversation_key: process.env.CONVERSATION_KEY,
  pathname: "/ai",
};
if (process.env.ENTITY_ID) body.entity_id = process.env.ENTITY_ID;
if (process.env.PERIOD_ID) body.period_id = process.env.PERIOD_ID;
process.stdout.write(JSON.stringify(body));
NODE
)"

TURN_STATUS="$({
  printf '%s' "$REQUEST_BODY" |
    curl --silent --show-error --max-time 1200 \
      --output "$TURN_FILE" --write-out '%{http_code}' \
      --request POST \
      --header "Content-Type: application/json" \
      --header "Cookie: $COOKIE_HEADER" \
      --data-binary @- \
      "$BASE_URL/api/operator/turn"
})"

cp "$TURN_FILE" "$REPORT"
if [ "$TURN_STATUS" != "200" ]; then
  cat "$TURN_FILE"
  fail "OPERATOR_TURN_FAILED_HTTP_${TURN_STATUS}"
fi

node - "$TURN_FILE" "$MAIN_BEFORE" <<'NODE'
const fs = require("fs");
const response = JSON.parse(fs.readFileSync(process.argv[2], "utf8") || "{}");
const mainBefore = process.argv[3];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? "").trim();
const execution = object(response.execution);
const capability = object(execution.capability);
const wrapped = object(execution.result);
const cycle = Object.keys(object(wrapped.result)).length ? object(wrapped.result) : wrapped;
const mission = object(cycle.mission);
const steps = list(mission.steps);
const assessment = object(cycle.repository_assessment);
const selection = object(assessment.objective_selection);
const decision = object(cycle.persistence_decision);
const governance = object(cycle.governance);
const responseText = text(response?.decision?.response_text);
const capabilityKey = text(capability.key) || [text(capability.domain), text(capability.capability), text(capability.action)].filter(Boolean).join(".");

function fail(reason, details = null) {
  console.error(`E2E_ASSERTION=FAIL:${reason}`);
  if (details) console.error(JSON.stringify(details, null, 2));
  process.exit(2);
}

if (text(execution.reason) === "INSUFFICIENT_WALLET_BALANCE") fail("INSUFFICIENT_WALLET_BALANCE");
if (capabilityKey !== "platform.product_engineering_cycle.execute") {
  fail("NATURAL_LANGUAGE_DID_NOT_ROUTE_TO_PRODUCT_ENGINEERING_CYCLE", {
    capability_key: capabilityKey || null,
    execution_status: execution.status || null,
    intent: response?.decision?.intent || null,
    response_text: responseText || null,
  });
}
if (!cycle.execution_key) fail("EXECUTION_KEY_MISSING");
if (!cycle.repository_head_observed) fail("REPOSITORY_HEAD_NOT_OBSERVED");
if (cycle.ref !== "main") fail("ENGINEERING_CYCLE_NOT_MAIN_ONLY");
if (!selection.selected_candidate_id) fail("PRODUCT_OBJECTIVE_NOT_SELECTED");
if (selection.evidence_backed !== true) fail("PRODUCT_OBJECTIVE_NOT_EVIDENCE_BACKED");
if (!list(selection.selected_completion_criteria).length) fail("PRODUCT_COMPLETION_CRITERIA_MISSING");
for (const id of ["assess_repository", "engineer_next_gap", "decide_persistence"]) {
  if (!steps.some((step) => text(step?.id) === id)) fail(`MISSION_STEP_MISSING:${id}`);
}
if (!text(decision.decision)) fail("PRODUCT_PERSISTENCE_DECISION_MISSING");
if (cycle.commit_completed !== false) fail("COMMIT_COMPLETED_DURING_LOCAL_E2E");
if (cycle.persistent_source_changed !== false) fail("PERSISTENT_SOURCE_CHANGED_DURING_LOCAL_E2E");
if (cycle.production_deployed !== false) fail("PRODUCTION_DEPLOYED_DURING_LOCAL_E2E");
if (cycle.database_migrations_applied !== false) fail("DATABASE_MIGRATION_APPLIED_DURING_LOCAL_E2E");
if (governance.direct_commit_step_allowed_in_engineering_mission !== false) fail("DIRECT_COMMIT_STEP_NOT_FAIL_CLOSED");
if (governance.code_ai_commit_capability_completed !== false) fail("CODE_AI_COMMIT_COMPLETED_DURING_ENGINEERING_MISSION");
if (governance.production_deployment_capability_invoked !== false) fail("PRODUCTION_DEPLOY_CAPABILITY_INVOKED");

const engineer = steps.find((step) => text(step?.id) === "engineer_next_gap") || {};
const verification = object(engineer.verification);
const engineerWrapped = object(engineer.result);
const engineerResult = Object.keys(object(engineerWrapped.result)).length ? object(engineerWrapped.result) : engineerWrapped;
const state = object(engineerResult.state);
const completionEvidence = [...list(state.evidence)].reverse().find(
  (entry) => entry?.kind === "product_completion_criteria_evidence" && entry?.verified === true,
);
if (text(mission.status) === "completed") {
  if (verification.passed !== true) fail("REGISTERED_CODE_VERIFICATION_NOT_PASSED", verification);
  if (!completionEvidence) fail("PRODUCT_COMPLETION_CRITERIA_EVIDENCE_NOT_PRESENT_IN_CODE_STATE");
}

console.log("E2E_RESULT=PASS");
console.log("E2E_ROUTE=NATURAL_LANGUAGE_TO_PRODUCT_ENGINEERING_CYCLE");
console.log(`E2E_MAIN_BEFORE=${mainBefore}`);
console.log(`E2E_REPOSITORY_HEAD_OBSERVED=${cycle.repository_head_observed}`);
console.log(`E2E_OBJECTIVE=${text(selection.selected_objective || assessment?.next_engineering_handoff?.focus).replace(/\s+/g, " ").slice(0, 500)}`);
console.log(`E2E_OBJECTIVE_CANDIDATE=${selection.selected_candidate_id}`);
console.log(`E2E_COMPLETION_CRITERIA=${list(selection.selected_completion_criteria).length}`);
console.log(`E2E_MISSION_STATUS=${text(mission.status) || text(cycle.status) || "unknown"}`);
console.log(`E2E_PERSISTENCE_DECISION=${text(decision.decision) || "unknown"}`);
console.log(`E2E_PERSISTENCE_STATE=${text(cycle.persistence_state) || "NONE"}`);
console.log(`E2E_COMMIT_CONFIRMATION_PREPARED=${cycle.commit_requested === true ? "YES" : "NO"}`);
console.log("E2E_COMMIT_COMPLETED=NO");
console.log("E2E_PRODUCTION_DEPLOYED=NO");
console.log("E2E_DATABASE_MIGRATIONS_APPLIED=NO");
console.log(`E2E_RESPONSE=${responseText.replace(/\s+/g, " ").slice(0, 1200)}`);
NODE
[ "$?" -eq 0 ] || fail "E2E_RESPONSE_ASSERTION_FAILED"

echo ""
echo "================ VERIFY MAIN WAS NOT MUTATED BY TEST ================"
git fetch origin main || fail "FINAL_GIT_FETCH_FAILED"
REMOTE_MAIN_AFTER="$(git rev-parse origin/main)"
LOCAL_MAIN_AFTER="$(git rev-parse HEAD)"
echo "LOCAL_MAIN_AFTER=$LOCAL_MAIN_AFTER"
echo "REMOTE_MAIN_AFTER=$REMOTE_MAIN_AFTER"

DIRTY_EXCLUDING_E2E="$(git status --porcelain | grep -v "^?? ${E2E_DIST_DIR}/" || true)"
if [ -n "$DIRTY_EXCLUDING_E2E" ]; then
  printf '%s\n' "$DIRTY_EXCLUDING_E2E"
  fail "LOCAL_WORKING_TREE_CHANGED_BY_E2E"
fi
if [ "$LOCAL_MAIN_AFTER" != "$MAIN_BEFORE" ]; then
  fail "LOCAL_MAIN_COMMIT_CHANGED_BY_E2E"
fi

if [ "$REMOTE_MAIN_AFTER" != "$MAIN_BEFORE" ]; then
  echo "E2E_CONCURRENT_MAIN_ADVANCE=YES"
else
  echo "E2E_CONCURRENT_MAIN_ADVANCE=NO"
fi

echo "REPORT=$REPORT"
echo "E2E_SAFE_STOP=BEFORE_ANY_COMMIT_OR_PRODUCTION_DEPLOY"
