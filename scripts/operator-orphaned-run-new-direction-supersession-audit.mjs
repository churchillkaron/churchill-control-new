import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const corePath = "lib/operator/runtime/OperatorTurnRuntimeCore.js";
const coreSource = await readFile(corePath, "utf8");

function requireFragments(source, label, fragments) {
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `${label} missing ${fragment}`);
  }
}

requireFragments(coreSource, corePath, [
  "function clearPendingAndSupersedeRun(agreementState, shouldSupersede)",
  "const run = autonomousRunFromAgreementState(agreementState)",
  "const orphanedPendingBoundRun = Boolean(",
  "operatorAutonomousRunRequiresPendingExecutionBinding(run)",
  "!runHasExactPendingBinding(run, agreementState)",
  "if (!shouldSupersede && !orphanedPendingBoundRun) return cleared",
  '"Orphaned pending-bound run superseded by a new user request"',
  ": clearPendingAndSupersedeRun(agreementState, Boolean(offeredPending))",
]);

const functionStart = coreSource.indexOf(
  "function clearPendingAndSupersedeRun(agreementState, shouldSupersede)",
);
const functionEnd = coreSource.indexOf(
  "function agreementWithPendingConfirmationRun({",
  functionStart,
);
assert.ok(functionStart >= 0 && functionEnd > functionStart);
const functionSource = coreSource.slice(functionStart, functionEnd);
assert.ok(
  functionSource.indexOf("const run = autonomousRunFromAgreementState(agreementState)") <
    functionSource.indexOf("const cleared = clearedAgreementState(agreementState)"),
  "supersession eligibility must be determined from the pre-cleanup durable run state",
);
assert.ok(
  functionSource.includes("!runHasExactPendingBinding(run, agreementState)"),
  "malformed or missing pending projection must be detected independently of normalization success",
);

const {
  createOperatorAutonomousRun,
  operatorAutonomousRunRequiresPendingExecutionBinding,
  operatorPendingExecutionMatchesAutonomousRun,
  transitionOperatorAutonomousRun,
} = await import("@/lib/operator/contracts/OperatorAutonomousRun");

function pendingAction(agreementState = {}) {
  const candidate = agreementState?.pending_execution;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  const capabilityKey = String(candidate.capability_key ?? "").trim();
  if (!capabilityKey) return null;
  const hasRunId = Object.prototype.hasOwnProperty.call(candidate, "run_id");
  return {
    capability_key: capabilityKey,
    ...(hasRunId
      ? { run_id: String(candidate.run_id ?? "").trim() || null }
      : {}),
    payload:
      candidate.payload && typeof candidate.payload === "object" &&
      !Array.isArray(candidate.payload)
        ? candidate.payload
        : {},
    resume_kind: String(candidate.resume_kind ?? "").trim().toLowerCase() || null,
    approval_request_id:
      String(candidate.approval_request_id ?? "").trim() || null,
  };
}

function runHasExactPendingBinding(run, agreementState = {}) {
  if (!operatorAutonomousRunRequiresPendingExecutionBinding(run)) return true;
  const pending = pendingAction(agreementState);
  return Boolean(
    pending && operatorPendingExecutionMatchesAutonomousRun(pending, run),
  );
}

function clearPendingAndSupersedeRun(agreementState, shouldSupersede) {
  const run = agreementState?.autonomous_run || null;
  const orphanedPendingBoundRun = Boolean(
    run &&
      operatorAutonomousRunRequiresPendingExecutionBinding(run) &&
      !runHasExactPendingBinding(run, agreementState),
  );
  const cleared = { ...agreementState };
  delete cleared.pending_execution;
  if (!shouldSupersede && !orphanedPendingBoundRun) return cleared;
  return {
    ...cleared,
    autonomous_run: transitionOperatorAutonomousRun(run, {
      status: "superseded",
      stepId: "requested_action",
      stepStatus: "superseded",
      blocker: orphanedPendingBoundRun
        ? "Orphaned pending-bound run superseded by a new user request"
        : "Pending action superseded by a new user request",
    }),
  };
}

const capabilityKey = "finance.example.write";
const payload = { document_id: "doc_new_direction_1", amount: 200 };
const run = createOperatorAutonomousRun({
  objective: "Post exact document",
  pendingExecution: {
    capability_key: capabilityKey,
    description: "Post the document",
    payload,
  },
});
const exactPending = {
  capability_key: capabilityKey,
  run_id: run.run_id,
  payload,
};

const validState = {
  autonomous_run: run,
  pending_execution: exactPending,
  unrelated_state: { keep: true },
};
const validSuperseded = clearPendingAndSupersedeRun(validState, true);
assert.equal(validSuperseded.autonomous_run.status, "superseded");
assert.equal(
  Object.prototype.hasOwnProperty.call(validSuperseded, "pending_execution"),
  false,
);
assert.deepEqual(validSuperseded.unrelated_state, { keep: true });

for (const malformedPending of [
  null,
  "broken",
  42,
  [],
  {},
  { payload },
  { capability_key: capabilityKey, payload },
  { capability_key: capabilityKey, run_id: "wrong_run", payload },
]) {
  const orphanedState = {
    autonomous_run: run,
    pending_execution: malformedPending,
    unrelated_state: { keep: true },
  };
  const next = clearPendingAndSupersedeRun(orphanedState, false);
  assert.equal(
    next.autonomous_run.status,
    "superseded",
    "a new ordinary request must retire a live single-action run whose exact pending binding is gone",
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(next, "pending_execution"),
    false,
    "stale pending projection must be physically removed",
  );
  assert.deepEqual(next.unrelated_state, { keep: true });
}

const runOnlyState = {
  autonomous_run: run,
  unrelated_state: { keep: true },
};
const runOnlySuperseded = clearPendingAndSupersedeRun(runOnlyState, false);
assert.equal(
  runOnlySuperseded.autonomous_run.status,
  "superseded",
  "a missing pending projection must not leave a pending-bound run live when a new request replaces it",
);

const completedRun = transitionOperatorAutonomousRun(run, {
  status: "completed",
  stepId: "requested_action",
  stepStatus: "completed",
  blocker: null,
});
const completedState = {
  autonomous_run: completedRun,
  unrelated_state: { keep: true },
};
const completedPreserved = clearPendingAndSupersedeRun(completedState, false);
assert.equal(
  completedPreserved.autonomous_run.status,
  "completed",
  "terminal history must not be rewritten merely because no pending projection exists",
);

console.log("OPERATOR_ORPHANED_RUN_NEW_DIRECTION_SUPERSESSION_AUDIT=PASS");
console.log("OPERATOR_ORPHANED_RUN_NEW_DIRECTION=MALFORMED_PENDING_SUPERSEDED");
console.log("OPERATOR_ORPHANED_RUN_NEW_DIRECTION=MISSING_PENDING_SUPERSEDED");
console.log("OPERATOR_ORPHANED_RUN_NEW_DIRECTION=VALID_PENDING_NEW_REQUEST_SUPERSEDED");
console.log("OPERATOR_ORPHANED_RUN_NEW_DIRECTION=TERMINAL_HISTORY_PRESERVED");
console.log("OPERATOR_ORPHANED_RUN_NEW_DIRECTION=NO_RECONSTRUCTION_NO_EXECUTION");
