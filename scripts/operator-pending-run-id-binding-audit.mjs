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
  'const PENDING_RUN_ID_BINDING = "run_id_v1"',
  "pending_binding: PENDING_RUN_ID_BINDING",
  "export function operatorPendingExecutionRunIdMatchesAutonomousRun(",
  'Object.prototype.hasOwnProperty.call(candidate,\n    "pending_binding",',
  "...(pendingBindingDeclared\n      ? { pending_binding: pendingBinding || null }\n      : {})",
  'Object.prototype.hasOwnProperty.call(\n    sourceRun,\n    "pending_binding",',
  'Object.prototype.hasOwnProperty.call(pending, "run_id")',
  "const runIdRequired = text(sourceRun.pending_binding) === PENDING_RUN_ID_BINDING",
  "if (runBindingDeclared && !runIdRequired) return false",
  "if (!runIdDeclared) return !runIdRequired",
  "return Boolean(pendingRunId) && pendingRunId === sourceRunId",
  "operatorPendingExecutionRunIdMatchesAutonomousRun(pending, run)",
  'text(run.run_kind).toLowerCase() !== "single_action"',
]);

requireFragments(coreSource, corePath, [
  'Object.prototype.hasOwnProperty.call(candidate, "run_id")',
  "...(hasRunId ? { run_id: text(candidate.run_id) || null } : {})",
  "const run = createOperatorAutonomousRun({",
  "run_id: run.run_id",
  "pending_execution: {\n      ...pending,\n      approval_request_id: approvalRequestId,",
  "function pendingVerificationExecution(",
  "...(text(runId) ? { run_id: text(runId) } : {})",
  "const verificationRun = autonomousRunFromAgreementState(next)",
  "verificationRun?.run_id",
  "!missionResumeProjectionMatches(pending, activeRun)",
]);

const confirmationStart = coreSource.indexOf(
  "function agreementWithPendingConfirmationRun({",
);
const confirmationEnd = coreSource.indexOf(
  "function pendingVerificationExecution(",
  confirmationStart,
);
assert.ok(confirmationStart >= 0 && confirmationEnd > confirmationStart);
const confirmationSource = coreSource.slice(confirmationStart, confirmationEnd);
assert.ok(
  confirmationSource.indexOf("const run = createOperatorAutonomousRun({") <
    confirmationSource.indexOf("const pendingExecution = {"),
  "new pending state must be projected from the already-created run referent",
);

const {
  createOperatorAutonomousRun,
  createOperatorMissionRun,
  normalizeOperatorAutonomousRun,
  operatorPendingExecutionMatchesAutonomousRun,
  operatorPendingExecutionRunIdMatchesAutonomousRun,
  transitionOperatorAutonomousRun,
} = await import("@/lib/operator/contracts/OperatorAutonomousRun");

const capabilityKey = "finance.example.write";
const payload = {
  document_id: "doc_run_id_1",
  amount: 250,
  nested: { currency: "THB" },
};
const confirmationRun = createOperatorAutonomousRun({
  objective: "Bind one exact confirmation to one exact run",
  pendingExecution: {
    capability_key: capabilityKey,
    description: "Post the exact document",
    payload,
  },
});
assert.equal(
  confirmationRun.pending_binding,
  "run_id_v1",
  "new single-action runs must explicitly require run-ID pending binding",
);
const exactPending = {
  capability_key: capabilityKey,
  run_id: confirmationRun.run_id,
  payload: {
    nested: { currency: "THB" },
    amount: 250,
    document_id: "doc_run_id_1",
  },
};

assert.equal(
  operatorPendingExecutionRunIdMatchesAutonomousRun(exactPending, confirmationRun),
  true,
  "exact pending run referent must match",
);
assert.equal(
  operatorPendingExecutionMatchesAutonomousRun(exactPending, confirmationRun),
  true,
  "exact run referent plus exact structure must authorize the binding",
);

const wrongReferentPending = {
  ...exactPending,
  run_id: "operator_run_different_but_structurally_equal",
};
assert.equal(
  operatorPendingExecutionRunIdMatchesAutonomousRun(
    wrongReferentPending,
    confirmationRun,
  ),
  false,
  "a different run referent must fail even when structure is identical",
);
assert.equal(
  operatorPendingExecutionMatchesAutonomousRun(
    wrongReferentPending,
    confirmationRun,
  ),
  false,
  "structurally identical pending state must not cross-bind between run IDs",
);

const noIdPending = {
  capability_key: capabilityKey,
  payload,
};
assert.equal(
  operatorPendingExecutionMatchesAutonomousRun(noIdPending, confirmationRun),
  false,
  "a new run must not downgrade to structural matching when pending run_id is removed",
);

const { pending_binding: _newBinding, ...legacyRunShape } = confirmationRun;
const legacyRun = normalizeOperatorAutonomousRun(legacyRunShape);
assert.equal(
  Object.prototype.hasOwnProperty.call(legacyRun, "pending_binding"),
  false,
  "legacy fixture must truly omit the run binding marker",
);
assert.equal(
  Object.prototype.hasOwnProperty.call(noIdPending, "run_id"),
  false,
  "legacy pending fixture must truly omit the run_id property",
);
assert.equal(
  operatorPendingExecutionRunIdMatchesAutonomousRun(noIdPending, legacyRun),
  true,
  "legacy run state may use structural fallback only when the run itself predates the binding marker",
);
assert.equal(
  operatorPendingExecutionMatchesAutonomousRun(noIdPending, legacyRun),
  true,
  "legacy structurally exact pending state remains backward compatible only with a legacy run",
);

for (const corruptedBinding of ["run_id_v2", "corrupt_binding", "", null, undefined]) {
  const corruptedRun = normalizeOperatorAutonomousRun({
    ...legacyRunShape,
    pending_binding: corruptedBinding,
  });
  assert.equal(
    Object.prototype.hasOwnProperty.call(corruptedRun, "pending_binding"),
    true,
    "declared binding corruption must remain distinguishable from true legacy absence",
  );
  assert.equal(
    operatorPendingExecutionRunIdMatchesAutonomousRun(noIdPending, corruptedRun),
    false,
    "unknown or empty declared binding markers must never enable legacy run-ID fallback",
  );
  assert.equal(
    operatorPendingExecutionMatchesAutonomousRun(noIdPending, corruptedRun),
    false,
    "unknown or empty declared binding markers must fail the full pending matcher",
  );
  assert.equal(
    operatorPendingExecutionMatchesAutonomousRun(
      { ...noIdPending, run_id: corruptedRun.run_id },
      corruptedRun,
    ),
    false,
    "an exact run ID must not authorize semantics for an unknown binding version",
  );
}

for (const declaredEmptyRunId of ["", null, undefined]) {
  const declaredEmptyPending = {
    ...noIdPending,
    run_id: declaredEmptyRunId,
  };
  assert.equal(
    Object.prototype.hasOwnProperty.call(declaredEmptyPending, "run_id"),
    true,
    "declared empty run ID fixture must retain the property",
  );
  assert.equal(
    operatorPendingExecutionMatchesAutonomousRun(
      declaredEmptyPending,
      confirmationRun,
    ),
    false,
    "declared empty run IDs must fail closed rather than downgrade to legacy",
  );
}

assert.equal(
  operatorPendingExecutionMatchesAutonomousRun(
    { ...exactPending, payload: { ...payload, amount: 999 } },
    confirmationRun,
  ),
  false,
  "matching run ID is necessary but never sufficient when payload drifts",
);

const approvalRequestId = "approval_run_id_exact_1";
const approvalRun = transitionOperatorAutonomousRun(confirmationRun, {
  status: "awaiting_approval",
  currentStepId: "requested_action",
  stepId: "requested_action",
  stepStatus: "awaiting_approval",
  blocker: "APPROVAL_REQUIRED",
  approvalRequestId,
});
assert.equal(
  approvalRun.pending_binding,
  "run_id_v1",
  "run binding requirement must survive approval transition",
);
const approvalPending = {
  ...exactPending,
  approval_request_id: approvalRequestId,
};
assert.equal(
  operatorPendingExecutionMatchesAutonomousRun(approvalPending, approvalRun),
  true,
  "approval state must retain the same exact run referent",
);
assert.equal(
  operatorPendingExecutionMatchesAutonomousRun(
    { ...approvalPending, run_id: "operator_run_wrong_approval_referent" },
    approvalRun,
  ),
  false,
  "approval request equality must not override a run referent mismatch",
);
assert.equal(
  operatorPendingExecutionMatchesAutonomousRun(
    { capability_key: capabilityKey, payload, approval_request_id: approvalRequestId },
    approvalRun,
  ),
  false,
  "approval state must not downgrade when its pending run referent is removed",
);

const verificationCapabilityKey = "finance.example.verify";
const verificationPayload = {
  document_id: "doc_run_id_1",
  expected_status: "posted",
};
const verificationBaseRun = createOperatorAutonomousRun({
  objective: "Bind verification retry to the original exact run",
  pendingExecution: {
    capability_key: capabilityKey,
    description: "Post and verify document",
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
assert.equal(
  verificationFailedRun.pending_binding,
  "run_id_v1",
  "run binding requirement must survive verification transitions",
);
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
  "verification retry must retain the original exact run referent",
);
assert.equal(
  operatorPendingExecutionMatchesAutonomousRun(
    { ...verificationPending, run_id: "operator_run_wrong_verification_referent" },
    verificationFailedRun,
  ),
  false,
  "verification retry must reject a different run referent",
);
const { run_id: _removedVerificationRunId, ...verificationWithoutRunId } =
  verificationPending;
assert.equal(
  operatorPendingExecutionMatchesAutonomousRun(
    verificationWithoutRunId,
    verificationFailedRun,
  ),
  false,
  "verification retry must not downgrade if its run referent is removed",
);

const missionRun = createOperatorMissionRun({
  objective: "Mission remains on its separate strict projection guard",
  missionState: {
    run_id: "mission_run_id_binding_audit_1",
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
  Object.prototype.hasOwnProperty.call(missionRun, "pending_binding"),
  false,
  "mission runs must not inherit the generic single-action binding marker",
);
assert.equal(
  operatorPendingExecutionMatchesAutonomousRun(
    {
      capability_key: capabilityKey,
      run_id: missionRun.run_id,
      payload,
    },
    missionRun,
  ),
  false,
  "mission runs must remain outside the generic pending run-ID matcher",
);

console.log("OPERATOR_PENDING_RUN_ID_BINDING_AUDIT=PASS");
console.log("OPERATOR_PENDING_RUN_ID_CONFIRMATION=EXACT_REFERENT_REQUIRED");
console.log("OPERATOR_PENDING_RUN_ID_APPROVAL=REFERENT_PRESERVED");
console.log("OPERATOR_PENDING_RUN_ID_VERIFICATION=REFERENT_PRESERVED");
console.log("OPERATOR_PENDING_RUN_ID_MISMATCH=STRUCTURALLY_EQUAL_REJECTED");
console.log("OPERATOR_PENDING_RUN_ID_LEGACY=ONLY_LEGACY_RUNS_ALLOW_STRUCTURAL_FALLBACK");
console.log("OPERATOR_PENDING_RUN_ID_DOWNGRADE=REMOVED_REFERENT_REJECTED_FOR_NEW_RUNS");
console.log("OPERATOR_PENDING_RUN_ID_BINDING_MARKER=UNKNOWN_OR_EMPTY_FAIL_CLOSED");
console.log("OPERATOR_PENDING_RUN_ID_EMPTY=FAIL_CLOSED");
console.log("OPERATOR_PENDING_RUN_ID_MISSION=SEPARATE");