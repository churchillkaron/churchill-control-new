import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const runPath = "lib/operator/contracts/OperatorAutonomousRun.js";
const corePath = "lib/operator/runtime/OperatorTurnRuntimeCore.js";

const [runSource, coreSource] = await Promise.all([
  readFile(runPath, "utf8"),
  readFile(corePath, "utf8"),
]);

function requireFragments(source, label, fragments) {
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `${label} missing ${fragment}`);
  }
}

requireFragments(runSource, runPath, [
  "export function operatorAutonomousRunRequiresPendingExecutionBinding(",
  'text(run.run_kind).toLowerCase() !== "single_action"',
  '["awaiting_confirmation", "awaiting_approval"].includes(status)',
  'text(run.current_step_id) === "requested_action"',
  'status !== "blocked"',
  'text(run.current_step_id) !== "post_action_verification"',
  'text(actionStep.status).toLowerCase() === "completed"',
  'text(verificationStep.status).toLowerCase() === "failed"',
]);

requireFragments(coreSource, corePath, [
  "operatorAutonomousRunRequiresPendingExecutionBinding,",
  "function runHasExactPendingBinding(run, agreementState = {})",
  "if (!operatorAutonomousRunRequiresPendingExecutionBinding(run)) return true",
  "pending && operatorPendingExecutionMatchesAutonomousRun(pending, run)",
  "const orphaned = !runHasExactPendingBinding(run, agreementState)",
  "This autonomous run is preserved as history",
  "It is not resumable from shorthand or confirmation",
  "I cannot resume that preserved run",
  "I will not reconstruct or guess the old payload",
  "orphaned_pending_bound_run: true",
  "execution_authorized: false",
]);

const statusStart = coreSource.indexOf("function runStatusTurn({");
const statusEnd = coreSource.indexOf("function runResumeTurn({", statusStart);
assert.ok(statusStart >= 0 && statusEnd > statusStart);
const statusSource = coreSource.slice(statusStart, statusEnd);
assert.ok(
  statusSource.includes("runHasExactPendingBinding(run, agreementState)"),
  "status must prove exact pending binding before claiming resumability",
);
assert.ok(
  statusSource.includes("response_text: orphaned"),
  "status must surface orphaned run truthfully",
);

const resumeStart = statusEnd;
const resumeEnd = coreSource.indexOf("function permissionMatches", resumeStart);
assert.ok(resumeStart >= 0 && resumeEnd > resumeStart);
const resumeSource = coreSource.slice(resumeStart, resumeEnd);
assert.ok(
  resumeSource.includes("runHasExactPendingBinding(run, agreementState)"),
  "resume must prove exact pending binding",
);
assert.ok(
  resumeSource.includes("if (orphaned)"),
  "orphaned resume must fail closed",
);
for (const forbidden of [
  "executeCapability(",
  "executeUbteCapability",
  "createOperatorAutonomousRun(",
  "transitionOperatorAutonomousRun(",
  "agreementWithRunTransition(",
]) {
  assert.ok(
    !resumeSource.includes(forbidden),
    `orphaned resume/status path must not reconstruct or execute through ${forbidden}`,
  );
}

const {
  createOperatorAutonomousRun,
  createOperatorMissionRun,
  operatorAutonomousRunRequiresPendingExecutionBinding,
  transitionOperatorAutonomousRun,
} = await import("@/lib/operator/contracts/OperatorAutonomousRun");

const capabilityKey = "finance.example.write";
const payload = { document_id: "doc_1", amount: 100 };
const confirmationRun = createOperatorAutonomousRun({
  objective: "Test pending-bound run status",
  pendingExecution: {
    capability_key: capabilityKey,
    description: "Post exact document",
    payload,
  },
});
assert.equal(
  operatorAutonomousRunRequiresPendingExecutionBinding(confirmationRun),
  true,
  "awaiting-confirmation single action must require its exact pending binding",
);

const approvalRun = transitionOperatorAutonomousRun(confirmationRun, {
  status: "awaiting_approval",
  currentStepId: "requested_action",
  stepId: "requested_action",
  stepStatus: "awaiting_approval",
  blocker: "APPROVAL_REQUIRED",
  approvalRequestId: "approval_1",
});
assert.equal(
  operatorAutonomousRunRequiresPendingExecutionBinding(approvalRun),
  true,
  "awaiting-approval single action must require its exact pending binding",
);

const verificationRun = createOperatorAutonomousRun({
  objective: "Test failed verification binding",
  pendingExecution: {
    capability_key: capabilityKey,
    description: "Post and verify document",
    payload,
    verify_after: {
      capability_key: "finance.example.verify",
      description: "Verify posted document",
      payload: { document_id: "doc_1" },
    },
  },
});
const verifying = transitionOperatorAutonomousRun(verificationRun, {
  status: "verifying",
  currentStepId: "post_action_verification",
  stepId: "requested_action",
  stepStatus: "completed",
  blocker: null,
});
const verificationFailed = transitionOperatorAutonomousRun(verifying, {
  status: "blocked",
  currentStepId: "post_action_verification",
  stepId: "post_action_verification",
  stepStatus: "failed",
  blocker: "Verification failed",
});
assert.equal(
  operatorAutonomousRunRequiresPendingExecutionBinding(verificationFailed),
  true,
  "failed verification retry must require its exact pending verification binding",
);

const completedRun = transitionOperatorAutonomousRun(confirmationRun, {
  status: "completed",
  stepId: "requested_action",
  stepStatus: "completed",
  blocker: null,
});
assert.equal(
  operatorAutonomousRunRequiresPendingExecutionBinding(completedRun),
  false,
  "completed historical run must not require a pending execution binding",
);

const missionRun = createOperatorMissionRun({
  objective: "Mission remains governed by its separate projection guard",
  missionState: {
    run_id: "mission_orphan_audit_1",
    status: "awaiting_confirmation",
    current_step_id: "write_1",
    steps: [
      {
        id: "read_1",
        kind: "read",
        description: "Read current state",
        capability_key: "finance.example.read",
        status: "completed",
      },
      {
        id: "write_1",
        kind: "action",
        description: "Write exact state",
        capability_key: capabilityKey,
        status: "awaiting_confirmation",
        gate: "confirmation",
        payload,
      },
    ],
    completed_step_ids: ["read_1"],
  },
});
assert.equal(
  operatorAutonomousRunRequiresPendingExecutionBinding(missionRun),
  false,
  "mission runs must remain outside this single-action orphan detector",
);

console.log("OPERATOR_ORPHANED_PENDING_RUN_STATUS_AUDIT=PASS");
console.log("OPERATOR_ORPHANED_PENDING_RUN_HISTORY=PRESERVED");
console.log("OPERATOR_ORPHANED_PENDING_RUN_STATUS=NONRESUMABLE_TRUTHFUL");
console.log("OPERATOR_ORPHANED_PENDING_RUN_RESUME=RESTATE_EXACT_ACTION_REQUIRED");
console.log("OPERATOR_ORPHANED_PENDING_RUN_RECONSTRUCTION=DISABLED");
console.log("OPERATOR_ORPHANED_PENDING_RUN_EXECUTION=DISABLED");
console.log("OPERATOR_ORPHANED_PENDING_RUN_MISSION=UNAFFECTED");
