import { readFile } from "node:fs/promises";

const runtimePath = "lib/operator/runtime/OperatorTurnRuntime.js";
const handoffPath =
  "lib/platform/capabilities/createProductPersistenceHandoffCapability.js";

const [runtime, handoff] = await Promise.all([
  readFile(runtimePath, "utf8"),
  readFile(handoffPath, "utf8"),
]);

function requireFragments(label, source, fragments) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      throw new Error(
        `OPERATOR_PRODUCT_STALE_BASE_CONVERSATION_AUDIT:${label} missing ${fragment}`,
      );
    }
  }
}

function section(source, start, end) {
  const startIndex = source.indexOf(start);
  if (startIndex < 0) return "";
  const endIndex = source.indexOf(end, startIndex + start.length);
  return endIndex < 0 ? source.slice(startIndex) : source.slice(startIndex, endIndex);
}

requireFragments("handoff-contract", handoff, [
  'status: "STALE_BASE_REPLAN_READY"',
  "stale_base_replan_required: true",
  "stale_persistence_rejected: true",
  "stale_patch_reused: false",
  "bounded_next_cycle_count: 1",
  "current_main_reassessment_count: 1",
  "current_main_reassessment_read_only: true",
  "fresh_next_engineering_handoff_count: 1",
  "next_engineering_cycle_started: false",
  "automatic_execution_started: false",
  "automatic_recursion_allowed: false",
]);

requireFragments("conversation-runtime", runtime, [
  'const staleBaseReplan = status === "STALE_BASE_REPLAN_READY"',
  'status !== "READY_FOR_ONE_NEXT_BOUNDED_CYCLE" && !staleBaseReplan',
  "continuation.stale_base_replan_required !== true",
  "continuation.stale_persistence_rejected !== true",
  "continuation.stale_patch_reused !== false",
  "continuation.bounded_next_cycle_count !== 1",
  "governance.current_main_reassessment_count !== 1",
  "governance.current_main_reassessment_read_only !== true",
  "governance.fresh_next_engineering_handoff_count !== 1",
  "governance.next_engineering_cycle_started !== false",
  "governance.automatic_execution_started !== false",
  "governance.automatic_recursion_allowed !== false",
  "handoff.automatic_execution_started !== false",
  'text(handoff.authorization_effect).toUpperCase() !== "NONE"',
  'source: direct.stale_base_replan',
  '"stale_base_current_main_reassessment"',
  "Product Intelligence rejected the stale engineering state",
  "performed one read-only reassessment of actual current main",
  "No engineering started automatically.",
]);

const boundedHandoff = section(
  runtime,
  "function boundedContinuationHandoff",
  "function postCommitContinuationHandoff",
);
if (!boundedHandoff) {
  throw new Error(
    "OPERATOR_PRODUCT_STALE_BASE_CONVERSATION_AUDIT: bounded continuation detector missing",
  );
}
if (boundedHandoff.includes('status === "STAY_LOCAL"')) {
  throw new Error(
    "OPERATOR_PRODUCT_STALE_BASE_CONVERSATION_AUDIT: ordinary STAY_LOCAL must not become a continuation status",
  );
}
for (const forbidden of [
  "executeUbteCapability",
  "runOperatorTurnCore(",
  "platform.code_ai_commit.execute",
  "platform.code_ai_autonomous.execute",
]) {
  if (boundedHandoff.includes(forbidden)) {
    throw new Error(
      `OPERATOR_PRODUCT_STALE_BASE_CONVERSATION_AUDIT: bounded detector must remain extraction-only; found ${forbidden}`,
    );
  }
}

const detector = section(
  runtime,
  "function postCommitContinuationHandoff",
  "function decisionText",
);
requireFragments("continuation-detector", detector, [
  "capabilityKey === PRODUCT_PERSISTENCE_HANDOFF_KEY",
  "capabilityKey === PRODUCT_ENGINEERING_CYCLE_KEY",
  "object(executionResult.persistence_handoff)",
  '"stale_base_current_main_reassessment"',
  '"verified_persistence_handoff"',
]);
for (const forbidden of [
  "executeUbteCapability",
  "runOperatorTurnCore(",
  "platform.code_ai_commit.execute",
  "platform.code_ai_autonomous.execute",
]) {
  if (detector.includes(forbidden)) {
    throw new Error(
      `OPERATOR_PRODUCT_STALE_BASE_CONVERSATION_AUDIT: conversation detector must not execute engineering or persistence; found ${forbidden}`,
    );
  }
}

const textBuilder = section(
  runtime,
  "function postCommitContinuationText",
  "function responseAgreementState",
);
requireFragments("stale-user-message", textBuilder, [
  'text(recommendation?.source) === "stale_base_current_main_reassessment"',
  "previous engineering result became stale because main moved",
  "rejected that stale persistence attempt",
  "one read-only reassessment of actual current main",
  "No engineering started automatically",
  'Say “next”, “continue”, or “do it”',
  "Verified persistence is complete.",
]);

console.log("OPERATOR_PRODUCT_STALE_BASE_CONVERSATION_AUDIT=PASS");
console.log("OPERATOR_PRODUCT_STALE_BASE_CONVERSATION=FRESH_OBJECTIVE_SURFACED");
console.log("OPERATOR_PRODUCT_STALE_BASE_CONVERSATION_STAY_LOCAL=NOT_CONTINUED");
console.log("OPERATOR_PRODUCT_STALE_BASE_CONVERSATION_AUTO_EXECUTION=DISABLED");
console.log("OPERATOR_PRODUCT_STALE_BASE_CONVERSATION_PATCH_REUSE=DISABLED");
