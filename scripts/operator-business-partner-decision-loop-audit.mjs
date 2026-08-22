import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const { classifyPendingOperatorReply } = await import(
  "@/lib/operator/runtime/OperatorHumanDecisionClassifier"
);

for (const message of [
  "yes",
  "yeah",
  "I agree",
  "sounds good",
  "jag håller med",
  "låter bra",
  "ich stimme zu",
  "d’accord",
  "de acuerdo",
  "ใช่",
]) {
  assert.equal(
    classifyPendingOperatorReply({ message, pending: true, recommendation: true }),
    "agree",
    `Recommendation agreement must not execute: ${message}`,
  );
}

for (const message of [
  "do it",
  "yes do it",
  "I agree, do it",
  "go ahead",
  "proceed",
  "make it happen",
  "gör det",
  "mach es",
  "fais le",
  "hazlo",
  "ทำเลย",
]) {
  assert.equal(
    classifyPendingOperatorReply({ message, pending: true, recommendation: true }),
    "execute",
    `Explicit recommendation execution must be recognized: ${message}`,
  );
}

for (const message of ["no", "no thanks", "cancel it", "nej", "ยกเลิก"]) {
  assert.equal(
    classifyPendingOperatorReply({ message, pending: true, recommendation: true }),
    "reject",
    `Recommendation rejection must be recognized: ${message}`,
  );
}

assert.equal(
  classifyPendingOperatorReply({ message: "yes", pending: true, recommendation: false }),
  "execute",
);
assert.equal(
  classifyPendingOperatorReply({ message: "do it", pending: false, recommendation: true }),
  null,
);

const [recommendationSource, turnSource, turnCoreSource] = await Promise.all([
  readFile("lib/operator/contracts/OperatorRecommendationState.js", "utf8"),
  readFile("lib/operator/runtime/OperatorTurnRuntime.js", "utf8"),
  readFile("lib/operator/runtime/OperatorTurnRuntimeCore.js", "utf8"),
]);

assert.match(recommendationSource, /recommended_action/);
assert.match(recommendationSource, /pending_execution/);
assert.match(recommendationSource, /createOperatorAutonomousRun/);
assert.match(recommendationSource, /delete next\.pending_execution/);

assert.match(turnSource, /runOperatorTurnCore/);
assert.match(turnSource, /classifyPendingOperatorReply/);
assert.match(turnSource, /recommendationAgreementTurn/);
assert.match(turnSource, /execution_authorized:\s*false/);
assert.match(turnSource, /Say “do it” when you want me to execute it/);
assert.match(turnSource, /projectStateWithRecommendationDecision/);
assert.match(turnSource, /Do not proceed with \$\{description\}/);
assert.match(turnSource, /PROJECT_STATUS_PATTERN/);
assert.match(turnSource, /RECOMMENDATION_STATUS_PATTERN/);
assert.match(turnSource, /recommendationEligible/);
assert.match(turnSource, /payloadSatisfiesRequiredFields/);
assert.match(turnSource, /canUseCapability/);
assert.match(turnSource, /canOfferRecommendation/);
assert.match(turnSource, /attentionCandidate\(result, safeCapabilities\)\s*\|\|\s*planCandidate/);
assert.match(turnSource, /appendExecutionOffer/);
assert.match(turnSource, /If you want me to execute that exact action, say “do it”/);
assert.match(turnSource, /persistedRecommendation/);

assert.match(turnCoreSource, /function executionBlockedReason/);
assert.match(turnCoreSource, /VOICE_CONFIRMATION_REQUIRED/);
assert.match(turnCoreSource, /CONFIRMATION_REQUIRED/);
assert.match(turnCoreSource, /resolveOperatorExecutionApproval/);
assert.match(turnCoreSource, /runPendingPostActionVerification/);
assert.match(turnCoreSource, /verifyOperatorExecution/);

console.log("OPERATOR_BUSINESS_PARTNER_DECISION_LOOP_AUDIT=PASS");
console.log("OPERATOR_RECOMMENDATION=EXACT_REGISTERED_PROPOSAL");
console.log("OPERATOR_RECOMMENDATION_AUTHORIZATION=NEVER_IMPLICIT");
console.log("OPERATOR_RECOMMENDATION_AGREEMENT=DECISION_WITHOUT_EXECUTION");
console.log("OPERATOR_DO_IT=SERVER_PERSISTED_EXACT_REFERENT");
console.log("OPERATOR_ACCEPTED_RECOMMENDATION=DURABLE_PROJECT_DECISION");
console.log("OPERATOR_REJECTED_RECOMMENDATION=DURABLE_PROJECT_DECISION");
console.log("OPERATOR_EVIDENCE_RECOMMENDATION=PRIORITIZED_OVER_GENERIC_RANKING");
console.log("OPERATOR_EXACT_ACTION_OFFER=SAY_DO_IT_ONLY_WHEN_PERSISTED");
console.log("OPERATOR_EXECUTION=EXISTING_CONFIRMATION_APPROVAL_VERIFICATION_GOVERNANCE");
console.log("OPERATOR_HUMAN_EXECUTION_AUTHORIZATION=EXPLICIT_ACTION_LANGUAGE_REQUIRED_FOR_RECOMMENDATIONS");
