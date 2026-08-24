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

const OPERATOR_MISSION_KEY = "platform.operator_mission.execute";

const { createOperatorMissionRun } = await import(
  "@/lib/operator/contracts/OperatorAutonomousRun"
);
const { runOperatorTurn } = await import(
  "@/lib/operator/runtime/OperatorTurnRuntimeCore"
);

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
    reason: "Resume the exact paused runtime-audit mission",
    original_message: "Post and verify the exact runtime-audit document",
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

function assertRunPreserved(result, run) {
  assert.equal(result.agreement_state?.autonomous_run?.run_id, run.run_id);
  assert.equal(result.agreement_state?.autonomous_run?.run_kind, "mission");
  assert.equal(
    result.agreement_state?.autonomous_run?.status,
    "awaiting_confirmation",
  );
  assert.deepEqual(result.agreement_state?.unrelated_state, { preserve: true });
}

function assertNoExecution(result) {
  assert.equal(result.execution, null, "runtime audit must not execute a capability");
  assert.equal(
    result.decision?.execution?.capability_key,
    null,
    "decision must not authorize a capability",
  );
}

async function operatorTurn(message, state) {
  return runOperatorTurn({
    organizationId: "org_operator_mission_runtime_audit",
    partyId: "party_operator_mission_runtime_audit",
    actor: {
      id: "actor_operator_mission_runtime_audit",
      name: "Operator mission runtime audit",
    },
    role: "OWNER",
    permissions: [],
    locale: "en",
    timezone: "UTC",
    message,
    source: "text",
    agreementState: state,
    projectState: {},
    conversation: [],
  });
}

const run = createOperatorMissionRun({
  objective: "Post and verify the exact runtime-audit document",
  missionState: {
    run_id: "operator_run_orphaned_mission_runtime_audit",
    status: "awaiting_confirmation",
    current_step_id: "post_document",
    completed_step_ids: ["read_document"],
    steps: [
      {
        id: "read_document",
        kind: "read",
        description: "Read the exact runtime-audit document",
        capability_key: "finance.runtime_audit.read",
        status: "completed",
        payload: { document_id: "runtime_audit_document" },
        gate: "none",
      },
      {
        id: "post_document",
        kind: "action",
        description: "Post the exact runtime-audit document",
        capability_key: "finance.runtime_audit.write",
        status: "planned",
        payload: {
          document_id: "runtime_audit_document",
          amount: 200,
        },
        gate: "confirmation",
        verify_after: {
          capability_key: "finance.runtime_audit.read",
          description: "Verify the exact runtime-audit document",
          payload: { document_id: "runtime_audit_document" },
        },
      },
    ],
  },
});
const exactPending = exactMissionPending(run);

const exactStatus = await operatorTurn(
  "status",
  agreementState(run, exactPending),
);
assert.equal(exactStatus.success, true);
assert.equal(exactStatus.operator_catalog?.orphaned_mission_run, false);
assert.equal(exactStatus.operator_catalog?.orphaned_pending_bound_run, false);
assert.equal(exactStatus.operator_catalog?.stale_pending_cleared, false);
assert.equal(exactStatus.operator_catalog?.execution_authorized, false);
assert.deepEqual(exactStatus.agreement_state?.pending_execution, exactPending);
assertRunPreserved(exactStatus, run);
assertNoExecution(exactStatus);

const missingStatus = await operatorTurn("status", agreementState(run));
assert.equal(missingStatus.success, true);
assert.equal(missingStatus.operator_catalog?.orphaned_mission_run, true);
assert.equal(missingStatus.operator_catalog?.orphaned_pending_bound_run, true);
assert.equal(missingStatus.operator_catalog?.stale_pending_cleared, false);
assert.equal(missingStatus.operator_catalog?.execution_authorized, false);
assert.equal(
  Object.prototype.hasOwnProperty.call(
    missingStatus.agreement_state,
    "pending_execution",
  ),
  false,
);
assert.match(
  missingStatus.decision?.response_text || "",
  /not resumable/i,
);
assertRunPreserved(missingStatus, run);
assertNoExecution(missingStatus);

const malformedPending = {
  capability_key: OPERATOR_MISSION_KEY,
  payload: {
    steps: [],
    resume: {},
  },
  reason: "Malformed runtime-audit mission projection",
  resume_kind: "mission",
};
const malformedStatus = await operatorTurn(
  "status",
  agreementState(run, malformedPending),
);
assert.equal(malformedStatus.success, true);
assert.equal(malformedStatus.operator_catalog?.orphaned_mission_run, true);
assert.equal(malformedStatus.operator_catalog?.orphaned_pending_bound_run, true);
assert.equal(malformedStatus.operator_catalog?.stale_pending_cleared, true);
assert.equal(malformedStatus.operator_catalog?.execution_authorized, false);
assert.equal(
  Object.prototype.hasOwnProperty.call(
    malformedStatus.agreement_state,
    "pending_execution",
  ),
  false,
);
assertRunPreserved(malformedStatus, run);
assertNoExecution(malformedStatus);

const missingResume = await operatorTurn("continue", agreementState(run));
assert.equal(missingResume.success, true);
assert.equal(missingResume.operator_catalog?.bypassed_for_run_resume, true);
assert.equal(missingResume.operator_catalog?.orphaned_mission_run, true);
assert.equal(missingResume.operator_catalog?.stale_pending_cleared, false);
assert.equal(missingResume.operator_catalog?.execution_authorized, false);
assert.match(
  missingResume.decision?.response_text || "",
  /will not reconstruct, guess, or replay the old mission/i,
);
assert.equal(missingResume.decision?.clarification?.required, true);
assertRunPreserved(missingResume, run);
assertNoExecution(missingResume);

const malformedResume = await operatorTurn(
  "continue",
  agreementState(run, malformedPending),
);
assert.equal(malformedResume.success, true);
assert.equal(malformedResume.operator_catalog?.bypassed_for_run_resume, true);
assert.equal(malformedResume.operator_catalog?.orphaned_mission_run, true);
assert.equal(malformedResume.operator_catalog?.stale_pending_cleared, true);
assert.equal(malformedResume.operator_catalog?.execution_authorized, false);
assert.equal(
  Object.prototype.hasOwnProperty.call(
    malformedResume.agreement_state,
    "pending_execution",
  ),
  false,
);
assertRunPreserved(malformedResume, run);
assertNoExecution(malformedResume);

const exactResume = await operatorTurn(
  "continue",
  agreementState(run, exactPending),
);
assert.equal(exactResume.success, true);
assert.equal(exactResume.operator_catalog?.bypassed_for_run_resume, true);
assert.equal(exactResume.decision?.clarification?.required, true);
assert.match(
  exactResume.decision?.response_text || "",
  /still requires your explicit confirmation/i,
);
assert.deepEqual(exactResume.agreement_state?.pending_execution, exactPending);
assertRunPreserved(exactResume, run);
assertNoExecution(exactResume);

console.log("OPERATOR_ORPHANED_MISSION_RUNTIME_AUDIT=PASS");
console.log("OPERATOR_ORPHANED_MISSION_RUNTIME_EXACT_STATUS=RESUMABLE_BOUND");
console.log("OPERATOR_ORPHANED_MISSION_RUNTIME_MISSING_STATUS=NONRESUMABLE_TRUTHFUL");
console.log("OPERATOR_ORPHANED_MISSION_RUNTIME_MALFORMED_STATUS=STALE_PENDING_CLEARED");
console.log("OPERATOR_ORPHANED_MISSION_RUNTIME_MISSING_RESUME=NO_RECONSTRUCTION_NO_REPLAY");
console.log("OPERATOR_ORPHANED_MISSION_RUNTIME_MALFORMED_RESUME=STALE_PENDING_CLEARED");
console.log("OPERATOR_ORPHANED_MISSION_RUNTIME_CONFIRMATION_RESUME=CONFIRMATION_STILL_REQUIRED");
console.log("OPERATOR_ORPHANED_MISSION_RUNTIME_EXECUTION=DISABLED");
