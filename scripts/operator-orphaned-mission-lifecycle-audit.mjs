import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const corePath = "lib/operator/runtime/OperatorTurnRuntimeCore.js";
const coreSource = await readFile(corePath, "utf8");

function requireFragments(source, label, fragments) {
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `${label} missing ${fragment}`);
  }
}

requireFragments(coreSource, corePath, [
  "function missionRunRequiresPendingExecutionBinding(run)",
  'text(run?.run_kind).toLowerCase() === "mission"',
  '["awaiting_confirmation", "awaiting_approval", "verifying"].includes(',
  "function runHasExactPendingBinding(run, agreementState = {})",
  "if (missionRunRequiresPendingExecutionBinding(run)) {",
  "pending && missionResumeProjectionMatches(pending, run)",
  "const orphanedMission = Boolean(",
  "orphaned && missionRunRequiresPendingExecutionBinding(run)",
  "its exact resumable mission projection is no longer safely bound to it",
  "I will not reconstruct, guess, or replay the old mission",
  "orphaned_mission_run: orphanedMission",
  "const orphanedMissionRun = Boolean(",
  "const orphanedRun = orphanedPendingBoundRun || orphanedMissionRun",
  '"Orphaned mission run superseded by a new user request"',
]);

const bindingStart = coreSource.indexOf(
  "function missionRunRequiresPendingExecutionBinding(run)",
);
const bindingEnd = coreSource.indexOf(
  "function hasStoredPendingExecution(agreementState = {})",
  bindingStart,
);
assert.ok(bindingStart >= 0 && bindingEnd > bindingStart);
const bindingSource = coreSource.slice(bindingStart, bindingEnd);
assert.ok(
  bindingSource.includes("missionResumeProjectionMatches(pending, run)"),
  "resumable missions must require their exact mission projection",
);
assert.ok(
  bindingSource.includes(
    'text(run?.run_kind).toLowerCase() === "mission"',
  ),
  "mission binding requirement must be mission-specific",
);
assert.ok(
  bindingSource.includes(
    '["awaiting_confirmation", "awaiting_approval", "verifying"].includes(',
  ),
  "only resumable paused mission states should require a pending projection",
);

const statusStart = coreSource.indexOf("function runStatusTurn({");
const statusEnd = coreSource.indexOf("function runResumeTurn({", statusStart);
assert.ok(statusStart >= 0 && statusEnd > statusStart);
const statusSource = coreSource.slice(statusStart, statusEnd);
assert.ok(
  statusSource.includes("orphanedMission"),
  "status must distinguish an orphaned mission from an exact resumable mission",
);
assert.ok(
  statusSource.includes("stalePendingCleared"),
  "status must physically clear malformed mission pending state",
);
assert.ok(
  statusSource.includes("execution_authorized: false"),
  "orphaned mission status must never authorize execution",
);

const resumeStart = statusEnd;
const resumeEnd = coreSource.indexOf("function permissionMatches", resumeStart);
assert.ok(resumeStart >= 0 && resumeEnd > resumeStart);
const resumeSource = coreSource.slice(resumeStart, resumeEnd);
assert.ok(
  resumeSource.includes("orphanedMission"),
  "resume must detect missing or malformed mission projection",
);
assert.ok(
  resumeSource.includes("I will not reconstruct, guess, or replay the old mission"),
  "orphaned mission resume must fail closed without reconstructing old work",
);
for (const forbidden of [
  "executeCapability(",
  "executeUbteCapability",
  "createOperatorMissionRun(",
  "missionResultTurn(",
]) {
  assert.ok(
    !resumeSource.includes(forbidden),
    `orphaned mission resume must not reconstruct or execute through ${forbidden}`,
  );
}

const supersedeStart = coreSource.indexOf(
  "function clearPendingAndSupersedeRun(agreementState, shouldSupersede)",
);
const supersedeEnd = coreSource.indexOf(
  "function agreementWithPendingConfirmationRun({",
  supersedeStart,
);
assert.ok(supersedeStart >= 0 && supersedeEnd > supersedeStart);
const supersedeSource = coreSource.slice(supersedeStart, supersedeEnd);
assert.ok(
  supersedeSource.includes("missionRunRequiresPendingExecutionBinding(run)"),
  "new-direction supersession must detect a paused orphaned mission",
);
assert.ok(
  supersedeSource.includes("!runHasExactPendingBinding(run, agreementState)"),
  "orphan detection must fail closed when the exact mission projection is missing or malformed",
);
assert.ok(
  supersedeSource.includes("if (!shouldSupersede && !orphanedRun) return cleared"),
  "ordinary new requests must retire orphaned live work while terminal history remains preserved",
);

const fastStart = coreSource.indexOf("const fastConversation = Boolean(");
const activeStateStart = coreSource.indexOf(
  "const activeAgreementState = respondsToPending",
  fastStart,
);
assert.ok(fastStart >= 0 && activeStateStart > fastStart);
const fastSource = coreSource.slice(fastStart, activeStateStart);
assert.ok(
  fastSource.includes("missionResumeProjectionMatches(offeredPending, activeRun)"),
  "neutral discussion must validate exact mission projection independently",
);
assert.ok(
  !fastSource.includes("clearPendingAndSupersedeRun("),
  "neutral discussion must preserve the mission run rather than supersede it",
);
assert.ok(
  !fastSource.includes("executeCapability("),
  "neutral discussion must not execute mission steps",
);

console.log("OPERATOR_ORPHANED_MISSION_LIFECYCLE_AUDIT=PASS");
console.log("OPERATOR_ORPHANED_MISSION_STATUS=NONRESUMABLE_TRUTHFUL");
console.log("OPERATOR_ORPHANED_MISSION_RESUME=NO_RECONSTRUCTION_NO_REPLAY");
console.log("OPERATOR_ORPHANED_MISSION_PENDING=STALE_PROJECTION_CLEARED");
console.log("OPERATOR_ORPHANED_MISSION_DISCUSSION=RUN_HISTORY_PRESERVED");
console.log("OPERATOR_ORPHANED_MISSION_NEW_DIRECTION=SUPERSEDED");
console.log("OPERATOR_ORPHANED_MISSION_TERMINAL_HISTORY=PRESERVED");
console.log("OPERATOR_ORPHANED_MISSION_EXECUTION=DISABLED");
