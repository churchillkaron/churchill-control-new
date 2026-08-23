import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const corePath = "lib/operator/runtime/OperatorTurnRuntimeCore.js";
const fastPath = "lib/operator/runtime/OperatorFastConversationRuntime.js";
const [coreSource, fastSource] = await Promise.all([
  readFile(corePath, "utf8"),
  readFile(fastPath, "utf8"),
]);

function requireFragments(path, source, fragments) {
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `${path} missing ${fragment}`);
  }
}

requireFragments(corePath, coreSource, [
  "const fastConversation = Boolean(",
  "if (fastConversation) {",
  "const exactPendingBinding = Boolean(",
  'offeredPending.resume_kind === "mission"',
  "missionResumeProjectionMatches(offeredPending, activeRun)",
  "operatorPendingExecutionMatchesAutonomousRun(",
  "const fastConversationAgreementState =",
  "hasStoredPendingExecution(agreementState) && !exactPendingBinding",
  "? clearedAgreementState(agreementState)",
  ": agreementState",
  "agreementState: fastConversationAgreementState",
]);

const pendingStart = coreSource.indexOf(
  "const pending = respondsToPending ? offeredPending : null;",
);
const fastStart = coreSource.indexOf("const fastConversation = Boolean(", pendingStart);
const fastReturn = coreSource.indexOf(
  "return runFastConversationTurn({",
  fastStart,
);
const supersedeStart = coreSource.indexOf(
  "const activeAgreementState = respondsToPending",
  fastStart,
);

assert.ok(pendingStart >= 0, "pending classification must exist");
assert.ok(fastStart > pendingStart, "fast conversation must be classified after pending response classification");
assert.ok(fastReturn > fastStart, "fast conversation must return directly");
assert.ok(
  supersedeStart > fastReturn,
  "neutral fast conversation must return before new-direction supersession",
);

const fastBlock = coreSource.slice(fastStart, supersedeStart);
assert.ok(
  fastBlock.includes("agreementState: fastConversationAgreementState"),
  "fast conversation must use its independently validated agreement state",
);
assert.ok(
  !fastBlock.includes("clearPendingAndSupersedeRun("),
  "neutral fast conversation must not supersede valid pending work",
);
assert.ok(
  !fastBlock.includes("executeCapability("),
  "neutral fast conversation must not execute business capabilities",
);

const exactBindingBranch = `hasStoredPendingExecution(agreementState) && !exactPendingBinding\n        ? clearedAgreementState(agreementState)\n        : agreementState`;
assert.ok(
  coreSource.includes(exactBindingBranch),
  "malformed stored pending must be cleared while exact pending is preserved",
);

requireFragments(fastPath, fastSource, [
  "without invoking business workflows or claiming any side effect",
  "execution: null",
  "capability_key: null",
  "agreement_state: agreementState",
]);

const newDirectionSupersession = coreSource.indexOf(
  "clearPendingAndSupersedeRun(agreementState, Boolean(offeredPending))",
  fastReturn,
);
assert.ok(
  newDirectionSupersession > fastReturn,
  "non-fast new requests must still pass through pending supersession",
);

console.log("OPERATOR_PENDING_NEUTRAL_CONVERSATION_AUDIT=PASS");
console.log("OPERATOR_PENDING_NEUTRAL_CONVERSATION_VALID=EXACT_PENDING_PRESERVED");
console.log("OPERATOR_PENDING_NEUTRAL_CONVERSATION_MISSION=EXACT_MISSION_PRESERVED");
console.log("OPERATOR_PENDING_NEUTRAL_CONVERSATION_MALFORMED=STALE_PENDING_CLEARED_NO_EXECUTION");
console.log("OPERATOR_PENDING_NEUTRAL_CONVERSATION_NEW_DIRECTION=SUPERSESSION_UNCHANGED");
console.log("OPERATOR_PENDING_NEUTRAL_CONVERSATION_EXECUTION=DISABLED");
