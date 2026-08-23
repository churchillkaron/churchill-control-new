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
  "export function operatorPendingExecutionMatchesAutonomousRun(",
  "operatorPendingExecutionRunIdMatchesAutonomousRun(pending, run)",
  'text(run.run_kind).toLowerCase() !== "single_action"',
  'resumeKind && resumeKind !== "verification"',
  '["awaiting_confirmation", "awaiting_approval"]',
  'text(run.current_step_id) !== "requested_action"',
  "text(pending.capability_key) !== text(actionStep.capability_key)",
  "!sameRunValue(object(pending.payload), object(actionStep.payload))",
  'text(actionStep.gate).toLowerCase() === "confirmation"',
  "approvalRequestId === text(actionStep.approval_request_id)",
  'text(run.current_step_id) !== "post_action_verification"',
  'text(verificationStep.status).toLowerCase() === "failed"',
]);

requireFragments(coreSource, corePath, [
  "operatorPendingExecutionMatchesAutonomousRun,",
  "function pendingRunStateMismatchTurn(",
  'const blocker = "OPERATOR_PENDING_EXECUTION_RUN_STATE_MISMATCH"',
  "const nextAgreementState = clearedAgreementState(agreementState)",
  "pending_run_binding_mismatch: true",
  "stale_pending_cleared: true",
  "autonomous_run_preserved: Boolean(run)",
  "execution_authorized: false",
  "const genericPendingBindingMismatch = Boolean(",
  'offeredPending?.resume_kind !== "mission"',
  "!operatorPendingExecutionMatchesAutonomousRun(offeredPending, activeRun)",
  "return pendingRunStateMismatchTurn({",
  "approvalRequestId: text(governance?.approvalRequest?.id) || null",
  "!missionResumeProjectionMatches(pending, activeRun)",
]);

const mismatchGuardStart = coreSource.indexOf(
  "const genericPendingBindingMismatch = Boolean(",
);
const pendingAssignmentStart = coreSource.indexOf(
  "const pending = respondsToPending ? offeredPending : null;",
  mismatchGuardStart,
);
const cancellationStart = coreSource.indexOf(
  "if (pending && isNegative(message))",
  mismatchGuardStart,
);
const verificationStart = coreSource.indexOf(
  "if (retryVerificationRequested && pending)",
  mismatchGuardStart,
);
const executionStart = coreSource.indexOf(
  "if (pending && (isAffirmative(message) || resumeFromApproval || resumeMission))",
  mismatchGuardStart,
);
assert.ok(mismatchGuardStart >= 0, "generic pending binding guard must exist");
assert.ok(
  pendingAssignmentStart > mismatchGuardStart,
  "binding guard must run before pending state is accepted",
);
assert.ok(
  cancellationStart > mismatchGuardStart,
  "binding guard must run before pending cancellation",
);
assert.ok(
  verificationStart > mismatchGuardStart,
  "binding guard must run before verification retry",
);
assert.ok(
  executionStart > mismatchGuardStart,
  "binding guard must run before pending execution",
);

const mismatchTurnStart = coreSource.indexOf(
  "function pendingRunStateMismatchTurn(",
);
const mismatchTurnEnd = coreSource.indexOf(
  "function agreementWithRunTransition",
  mismatchTurnStart,
);
assert.ok(mismatchTurnStart >= 0 && mismatchTurnEnd > mismatchTurnStart);
const mismatchTurnSource = coreSource.slice(mismatchTurnStart, mismatchTurnEnd);
for (const forbidden of [
  "executeCapability(",
  "executeUbteCapability",
  "agreementWithRunTransition(",
  "transitionOperatorAutonomousRun(",
]) {
  assert.ok(
    !mismatchTurnSource.includes(forbidden),
    `pending/run mismatch must not perform side effect through ${forbidden}`,
  );
}

const {
  createOperatorAutonomousRun,
  operatorPendingExecutionMatchesAutonomousRun,
  transitionOperatorAutonomousRun,
} = await import("@/lib/operator/contracts/OperatorAutonomousRun");

const capabilityKey = "finance.example.write";
const payload = {
  alpha: 1,
  nested: { beta: 2, gamma: ["x", "y"] },
};
const confirmationRun = createOperatorAutonomousRun({
  objective: "Test exact pending/run binding",
  pendingExecution: {
    capability_key: capabilityKey,
    description: "Execute exact test action",
    payload,
  },
});
const confirmationPending = {
  capability_key: capabilityKey,
  run_id: confirmationRun.run_id,
  payload: {
    nested: { gamma: ["x", "y"], beta: 2 },
    alpha: 1,
  },
};

assert.equal(
  operatorPendingExecutionMatchesAutonomousRun(
    confirmationPending,
    confirmationRun,
  ),
  true,
  "exact canonical confirmation pending must match its single-action run",
);
assert.equal(
  operatorPendingExecutionMatchesAutonomousRun(
    { ...confirmationPending, capability_key: "finance.other.write" },
    confirmationRun,
  ),
  false,
  "capability drift must fail closed",
);
assert.equal(
  operatorPendingExecutionMatchesAutonomousRun(
    { ...confirmationPending, payload: { ...payload, alpha: 9 } },
    confirmationRun,
  ),
  false,
  "payload drift must fail closed",
);
assert.equal(
  operatorPendingExecutionMatchesAutonomousRun(confirmationPending, null),
  false,
  "missing run must fail closed",
);
assert.equal(
  operatorPendingExecutionMatchesAutonomousRun(
    { ...confirmationPending, resume_kind: "mission" },
    confirmationRun,
  ),
  false,
  "mission resume must remain outside the generic matcher",
);

const approvalRequestId = "approval_exact_1";
const approvalRun = transitionOperatorAutonomousRun(confirmationRun, {
  status: "awaiting_approval",
  currentStepId: "requested_action",
  stepId: "requested_action",
  stepStatus: "awaiting_approval",
  blocker: "APPROVAL_REQUIRED",
  approvalRequestId,
});
const approvalPending = {
  ...confirmationPending,
  approval_request_id: approvalRequestId,
};
assert.equal(
  operatorPendingExecutionMatchesAutonomousRun(approvalPending, approvalRun),
  true,
  "approval resume must require the exact stored approval request ID",
);
assert.equal(
  operatorPendingExecutionMatchesAutonomousRun(
    { ...approvalPending, approval_request_id: "approval_wrong" },
    approvalRun,
  ),
  false,
  "approval request drift must fail closed",
);

const verificationCapabilityKey = "finance.example.verify";
const verificationPayload = { document_id: "doc_1", expected_status: "posted" };
const verificationBaseRun = createOperatorAutonomousRun({
  objective: "Verify exact business effect",
  pendingExecution: {
    capability_key: capabilityKey,
    description: "Execute action then verify",
    payload,
    verify_after: {
      capability_key: verificationCapabilityKey,
      description: "Verify posted status",
      payload: verificationPayload,
    },
  },
});
const actionCompletedRun = transitionOperatorAutonomousRun(verificationBaseRun, {
  status: "verifying",
  currentStepId: "post_action_verification",
  stepId: "requested_action",
  stepStatus: "completed",
  blocker: null,
});
const verificationFailedRun = transitionOperatorAutonomousRun(actionCompletedRun, {
  status: "blocked",
  currentStepId: "post_action_verification",
  stepId: "post_action_verification",
  stepStatus: "failed",
  blocker: "Verification failed",
});
const verificationPending = {
  capability_key: verificationCapabilityKey,
  run_id: verificationFailedRun.run_id,
  payload: verificationPayload,
  resume_kind: "verification",
};
assert.equal(
  operatorPendingExecutionMatchesAutonomousRun(
    verificationPending,
    verificationFailedRun,
  ),
  true,
  "verification retry must match the exact failed verification step",
);
assert.equal(
  operatorPendingExecutionMatchesAutonomousRun(
    {
      ...verificationPending,
      payload: { document_id: "doc_2", expected_status: "posted" },
    },
    verificationFailedRun,
  ),
  false,
  "verification payload drift must fail closed",
);

console.log("OPERATOR_PENDING_RUN_BINDING_AUDIT=PASS");
console.log(
  "OPERATOR_PENDING_RUN_CONFIRMATION=EXACT_CAPABILITY_PAYLOAD_RUN",
);
console.log("OPERATOR_PENDING_RUN_APPROVAL=EXACT_REQUEST_ID");
console.log(
  "OPERATOR_PENDING_RUN_VERIFICATION=EXACT_FAILED_VERIFICATION_STEP",
);
console.log(
  "OPERATOR_PENDING_RUN_MISMATCH=BLOCKED_BEFORE_SIDE_EFFECTS",
);
console.log(
  "OPERATOR_PENDING_RUN_STALE_PENDING=CLEARED_RUN_PRESERVED",
);
console.log(
  "OPERATOR_PENDING_RUN_MISSION=SEPARATE_STRICT_PROJECTION_GUARD",
);
