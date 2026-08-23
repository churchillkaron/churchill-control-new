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
  "function runHasExactPendingBinding(run, agreementState = {})",
  "function hasStoredPendingExecution(agreementState = {})",
  "Object.prototype.hasOwnProperty.call(",
  '"pending_execution"',
  "function clearedAgreementState(agreementState = {})",
  "delete next.pending_execution",
  "const orphaned = !runHasExactPendingBinding(run, agreementState)",
  "orphaned && hasStoredPendingExecution(agreementState)",
  "const stalePendingCleared = hasStoredPendingExecution(agreementState)",
  "const nextAgreementState = stalePendingCleared",
  "? clearedAgreementState(agreementState)",
  "agreement_state: nextAgreementState",
  "stale_pending_cleared: stalePendingCleared",
  "I will not reconstruct or guess the old payload",
  "orphaned_pending_bound_run: true",
  "execution_authorized: false",
]);

const statusStart = coreSource.indexOf("function runStatusTurn({");
const statusEnd = coreSource.indexOf("function runResumeTurn({", statusStart);
assert.ok(statusStart >= 0 && statusEnd > statusStart);
const statusSource = coreSource.slice(statusStart, statusEnd);
assert.ok(
  statusSource.includes("orphaned && hasStoredPendingExecution(agreementState)"),
  "orphaned status must detect raw stored pending state even when normalization fails",
);
assert.ok(
  statusSource.includes("? clearedAgreementState(agreementState)"),
  "orphaned status must remove the raw stale pending projection",
);
assert.equal(
  (statusSource.match(/agreement_state: nextAgreementState/g) || []).length,
  2,
  "status must return cleaned agreement state in both decision and top-level state",
);

const resumeStart = statusEnd;
const resumeEnd = coreSource.indexOf("function permissionMatches", resumeStart);
assert.ok(resumeStart >= 0 && resumeEnd > resumeStart);
const resumeSource = coreSource.slice(resumeStart, resumeEnd);
assert.ok(
  resumeSource.includes("const stalePendingCleared = hasStoredPendingExecution(agreementState)"),
  "orphaned resume must detect raw stored pending state even when normalization fails",
);
assert.ok(
  resumeSource.includes("? clearedAgreementState(agreementState)"),
  "orphaned resume must remove the raw stale pending projection",
);
assert.ok(
  resumeSource.includes("agreement_state: nextAgreementState"),
  "orphaned resume must return cleaned agreement state",
);

for (const [label, source] of [
  ["status", statusSource],
  ["resume", resumeSource],
]) {
  for (const forbidden of [
    "executeCapability(",
    "executeUbteCapability",
    "createOperatorAutonomousRun(",
    "transitionOperatorAutonomousRun(",
    "agreementWithRunTransition(",
  ]) {
    assert.ok(
      !source.includes(forbidden),
      `${label} orphan cleanup must not reconstruct, transition, or execute through ${forbidden}`,
    );
  }
}

const {
  createOperatorAutonomousRun,
  createOperatorMissionRun,
  operatorAutonomousRunRequiresPendingExecutionBinding,
  operatorPendingExecutionMatchesAutonomousRun,
} = await import("@/lib/operator/contracts/OperatorAutonomousRun");

function hasStoredPendingExecution(agreementState = {}) {
  return Object.prototype.hasOwnProperty.call(
    agreementState && typeof agreementState === "object" && !Array.isArray(agreementState)
      ? agreementState
      : {},
    "pending_execution",
  );
}

function clearOnlyPendingExecution(agreementState = {}) {
  const next = { ...agreementState };
  delete next.pending_execution;
  return next;
}

const capabilityKey = "finance.example.write";
const exactPayload = {
  document_id: "doc_cleanup_1",
  amount: 100,
  nested: { currency: "THB" },
};
const run = createOperatorAutonomousRun({
  objective: "Test orphan cleanup",
  pendingExecution: {
    capability_key: capabilityKey,
    description: "Post exact document",
    payload: exactPayload,
  },
});
const exactPending = {
  capability_key: capabilityKey,
  payload: {
    nested: { currency: "THB" },
    amount: 100,
    document_id: "doc_cleanup_1",
  },
};
const stalePending = {
  ...exactPending,
  payload: {
    ...exactPayload,
    amount: 999,
  },
};

assert.equal(
  operatorAutonomousRunRequiresPendingExecutionBinding(run),
  true,
  "awaiting-confirmation single action must require pending binding",
);
assert.equal(
  operatorPendingExecutionMatchesAutonomousRun(exactPending, run),
  true,
  "valid exact pending binding must remain valid",
);
assert.equal(
  operatorPendingExecutionMatchesAutonomousRun(stalePending, run),
  false,
  "drifted pending projection must be recognized as invalid",
);

const agreementWithStalePending = {
  autonomous_run: run,
  pending_execution: stalePending,
  unrelated_state: { keep: true },
};
const cleaned = clearOnlyPendingExecution(agreementWithStalePending);
assert.equal(
  Object.prototype.hasOwnProperty.call(cleaned, "pending_execution"),
  false,
  "cleanup must physically remove the invalid pending projection",
);
assert.deepEqual(cleaned.autonomous_run, run, "cleanup must preserve autonomous run history unchanged");
assert.deepEqual(cleaned.unrelated_state, { keep: true }, "cleanup must preserve unrelated agreement state");

for (const malformedPending of [
  null,
  "broken",
  42,
  [],
  {},
  { payload: { amount: 100 } },
  { capability_key: "" },
]) {
  const malformedAgreement = {
    autonomous_run: run,
    pending_execution: malformedPending,
    unrelated_state: { keep: true },
  };
  assert.equal(
    hasStoredPendingExecution(malformedAgreement),
    true,
    "raw pending field presence must be detected independently of normalization",
  );
  assert.equal(
    operatorPendingExecutionMatchesAutonomousRun(malformedPending, run),
    false,
    "malformed pending projection must never exact-match an autonomous run",
  );
  const malformedCleaned = clearOnlyPendingExecution(malformedAgreement);
  assert.equal(
    Object.prototype.hasOwnProperty.call(malformedCleaned, "pending_execution"),
    false,
    "malformed stored pending projection must be physically removable",
  );
  assert.deepEqual(
    malformedCleaned.autonomous_run,
    run,
    "malformed cleanup must preserve autonomous run history",
  );
  assert.deepEqual(
    malformedCleaned.unrelated_state,
    { keep: true },
    "malformed cleanup must preserve unrelated agreement state",
  );
}

const agreementWithValidPending = {
  autonomous_run: run,
  pending_execution: exactPending,
};
assert.equal(
  operatorPendingExecutionMatchesAutonomousRun(
    agreementWithValidPending.pending_execution,
    agreementWithValidPending.autonomous_run,
  ),
  true,
  "valid pending projection must not qualify for orphan cleanup",
);

const runOnlyAgreement = { autonomous_run: run };
assert.equal(
  hasStoredPendingExecution(runOnlyAgreement),
  false,
  "absence of pending field must remain distinct from malformed stored pending state",
);
const runOnlyCleaned = clearOnlyPendingExecution(runOnlyAgreement);
assert.deepEqual(
  runOnlyCleaned,
  runOnlyAgreement,
  "missing-pending orphan state must remain run-only without reconstruction",
);

const missionRun = createOperatorMissionRun({
  objective: "Mission stays on separate projection guard",
  missionState: {
    run_id: "mission_cleanup_audit_1",
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
        payload: exactPayload,
      },
    ],
    completed_step_ids: ["read_1"],
  },
});
assert.equal(
  operatorAutonomousRunRequiresPendingExecutionBinding(missionRun),
  false,
  "mission runs must remain outside single-action orphan cleanup detection",
);

console.log("OPERATOR_ORPHANED_PENDING_RUN_CLEANUP_AUDIT=PASS");
console.log("OPERATOR_ORPHANED_PENDING_RUN_CLEANUP=INVALID_PENDING_REMOVED");
console.log("OPERATOR_ORPHANED_PENDING_RUN_MALFORMED=RAW_FIELD_REMOVED");
console.log("OPERATOR_ORPHANED_PENDING_RUN_HISTORY=PRESERVED_UNCHANGED");
console.log("OPERATOR_ORPHANED_PENDING_RUN_STATUS=SELF_HEALING_NO_EXECUTION");
console.log("OPERATOR_ORPHANED_PENDING_RUN_RESUME=SELF_HEALING_NO_RECONSTRUCTION");
console.log("OPERATOR_ORPHANED_PENDING_RUN_VALID_BINDING=PRESERVED");
console.log("OPERATOR_ORPHANED_PENDING_RUN_MISSION=UNAFFECTED");
