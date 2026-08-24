import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const inertImportEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: "operator-runtime-audit-placeholder",
};
for (const [name, value] of Object.entries(inertImportEnvironment)) {
  if (!process.env[name]) process.env[name] = value;
}

const { createOperatorMissionRun } = await import(
  "@/lib/operator/contracts/OperatorAutonomousRun"
);
const { runOperatorTurn } = await import(
  "@/lib/operator/runtime/OperatorTurnRuntimeCore"
);

const OPERATOR_MISSION_KEY = "platform.operator_mission.execute";

function missionStepProjection(step) {
  return {
    id: step.id,
    description: step.description,
    capability_key: step.capability_key,
    payload: step.payload || {},
    ...(step.verify_after
      ? {
          verify_after: {
            capability_key: step.verify_after.capability_key,
            description: step.verify_after.description,
            payload: step.verify_after.payload || {},
          },
        }
      : {}),
  };
}

function exactMissionPending(run) {
  return {
    capability_key: OPERATOR_MISSION_KEY,
    payload: {
      steps: run.planned_steps.map(missionStepProjection),
      resume: {
        current_step_id: run.current_step_id,
        completed_step_ids: [...run.completed_steps],
        current_step_confirmed: false,
        approval_request_id: null,
        verification_pending: null,
      },
    },
    reason: "Resume exact localized-status audit mission",
    original_message: "Post exact localized-status audit document",
    resume_kind: "mission",
  };
}

function agreementState(run, pendingExecution) {
  const state = {
    autonomous_run: run,
    unrelated_state: { preserve: true },
  };
  if (arguments.length > 1) state.pending_execution = pendingExecution;
  return state;
}

function assertNoExecution(result) {
  assert.equal(result.execution, null);
  assert.equal(result.decision?.execution?.capability_key, null);
  assert.equal(result.operator_catalog?.execution_authorized, false);
}

function assertRunPreserved(result, run) {
  assert.equal(result.agreement_state?.autonomous_run?.run_id, run.run_id);
  assert.equal(result.agreement_state?.autonomous_run?.status, "awaiting_confirmation");
  assert.deepEqual(result.agreement_state?.unrelated_state, { preserve: true });
}

async function turn(message, state, locale) {
  return runOperatorTurn({
    organizationId: "org_localized_status_runtime_audit",
    partyId: "party_localized_status_runtime_audit",
    actor: { id: "actor_localized_status_runtime_audit" },
    role: "OWNER",
    permissions: [],
    locale,
    timezone: "UTC",
    message,
    source: "text",
    agreementState: state,
    projectState: {},
    conversation: [],
  });
}

const run = createOperatorMissionRun({
  objective: "Post exact localized-status audit document",
  missionState: {
    run_id: "operator_run_localized_status_runtime_audit",
    status: "awaiting_confirmation",
    current_step_id: "post_document",
    completed_step_ids: ["read_document"],
    steps: [
      {
        id: "read_document",
        kind: "read",
        description: "Read exact localized-status audit document",
        capability_key: "finance.localized_status_audit.read",
        status: "completed",
        payload: { document_id: "localized_status_audit" },
        gate: "none",
      },
      {
        id: "post_document",
        kind: "action",
        description: "Post exact localized-status audit document",
        capability_key: "finance.localized_status_audit.write",
        status: "planned",
        payload: { document_id: "localized_status_audit" },
        gate: "confirmation",
      },
    ],
  },
});
const pending = exactMissionPending(run);

const localizedStatus = [
  ["sv", "Vad är statusen?"],
  ["de", "Wie ist der Status?"],
  ["fr", "Quel est le statut ?"],
  ["es", "¿Cuál es el estado?"],
  ["th", "สถานะเป็นอย่างไร"],
];

for (const [locale, message] of localizedStatus) {
  const result = await turn(message, agreementState(run, pending), locale);
  assert.equal(result.success, true);
  assert.equal(result.operator_catalog?.bypassed_for_run_status, true);
  assert.equal(result.operator_catalog?.orphaned_mission_run, false);
  assert.equal(result.operator_catalog?.stale_pending_cleared, false);
  assert.deepEqual(result.agreement_state?.pending_execution, pending);
  assertRunPreserved(result, run);
  assertNoExecution(result);
}

for (const [locale, message] of localizedStatus) {
  const result = await turn(message, agreementState(run), locale);
  assert.equal(result.success, true);
  assert.equal(result.operator_catalog?.bypassed_for_run_status, true);
  assert.equal(result.operator_catalog?.orphaned_mission_run, true);
  assert.equal(result.operator_catalog?.orphaned_pending_bound_run, true);
  assert.equal(result.operator_catalog?.stale_pending_cleared, false);
  assert.equal(result.decision?.clarification?.required, true);
  assert.match(result.decision?.response_text || "", /not resumable/i);
  assertRunPreserved(result, run);
  assertNoExecution(result);
}

const malformedPending = {
  capability_key: OPERATOR_MISSION_KEY,
  payload: { steps: [], resume: {} },
  reason: "Malformed localized-status projection",
  resume_kind: "mission",
};
const malformed = await turn(
  "Vad är statusen?",
  agreementState(run, malformedPending),
  "sv",
);
assert.equal(malformed.operator_catalog?.bypassed_for_run_status, true);
assert.equal(malformed.operator_catalog?.orphaned_mission_run, true);
assert.equal(malformed.operator_catalog?.stale_pending_cleared, true);
assert.equal(
  Object.prototype.hasOwnProperty.call(malformed.agreement_state, "pending_execution"),
  false,
);
assertRunPreserved(malformed, run);
assertNoExecution(malformed);

console.log("OPERATOR_LOCALIZED_STATUS_RUNTIME_AUDIT=PASS");
console.log("OPERATOR_LOCALIZED_STATUS_LANGUAGES=SV_DE_FR_ES_TH");
console.log("OPERATOR_LOCALIZED_STATUS_EXACT=READ_ONLY_STATUS_PATH");
console.log("OPERATOR_LOCALIZED_STATUS_VALID=EXACT_PENDING_PRESERVED");
console.log("OPERATOR_LOCALIZED_STATUS_ORPHANED=NONRESUMABLE_TRUTHFUL");
console.log("OPERATOR_LOCALIZED_STATUS_MALFORMED=STALE_PENDING_CLEARED");
console.log("OPERATOR_LOCALIZED_STATUS_EXECUTION=DISABLED");
