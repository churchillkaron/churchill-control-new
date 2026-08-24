import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const turnPath = "lib/operator/runtime/OperatorTurnRuntimeLegacy.js";
const fastPath = "lib/operator/runtime/OperatorFastConversationRuntime.js";
const [turnSource, fastSource] = await Promise.all([
  readFile(turnPath, "utf8"),
  readFile(fastPath, "utf8"),
]);

function requireFragments(path, source, fragments) {
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `${path} missing ${fragment}`);
  }
}

requireFragments(turnPath, turnSource, [
  "RECOMMENDATION_ALTERNATIVE_PATTERN",
  "recommendationDiscussionKind",
  "recommendationConversationContext",
  "agreementWithRecommendationDisarmed",
  "recommendationDiscussionTurn",
  'return "alternative"',
  'return "discussion"',
  "runFastConversationTurn",
  'previous_recommendation_pending_execution: alternative',
  '"DISARMED"',
  '"PRESERVED"',
  "execution_authorized: false",
  "recommendation_exactly_bound: exactBinding",
  "shorthand like “do it” will not run it",
]);

requireFragments(turnPath, turnSource, [
  "vad rekommenderade du",
  "was hast du empfohlen",
  "quelle était ta recommandation",
  "qué recomendaste",
  "คุณแนะนำอะไร",
  "varför",
  "vad menar du",
  "warum",
  "was meinst du",
  "pourquoi",
  "tu veux dire quoi",
  "por qué",
  "qué quieres decir",
  "ทำไม",
  "หมายความว่าอะไร",
]);

const discussionStart = turnSource.indexOf(
  "async function recommendationDiscussionTurn",
);
const requiredFieldsStart = turnSource.indexOf(
  "function requiredFields",
  discussionStart,
);
assert.ok(discussionStart >= 0 && requiredFieldsStart > discussionStart);
const discussionSource = turnSource.slice(discussionStart, requiredFieldsStart);
for (const forbidden of [
  "runOperatorTurnCore(",
  "executeUbteCapability",
  "platform.code_ai_autonomous.execute",
  "platform.code_ai_commit.execute",
]) {
  assert.ok(
    !discussionSource.includes(forbidden),
    `recommendation discussion must not execute through ${forbidden}`,
  );
}
assert.ok(
  discussionSource.includes("execution: null"),
  "recommendation discussion must return without execution",
);
assert.ok(
  discussionSource.includes("execution: { capability_key: null, payload: {}, reason: null }"),
  "recommendation discussion decision must not request capability execution",
);

const runTurnStart = turnSource.indexOf("export async function runOperatorTurn");
const coreStart = turnSource.indexOf(
  "const coreResult = await runOperatorTurnCore",
  runTurnStart,
);
const discussionGuard = turnSource.slice(runTurnStart, coreStart);
assert.ok(
  discussionGuard.includes("isRecommendationStatusTurn(options.message)"),
  "recommendation status must be classified before operator core execution",
);
assert.ok(
  discussionGuard.includes("return recommendationStatusTurn(options, recommendation)"),
  "recommendation status must return before operator core execution",
);
assert.ok(
  discussionGuard.includes("recommendationDiscussionKind(options.message)"),
  "discussion must be classified before operator core execution",
);
assert.ok(
  discussionGuard.includes("return recommendationDiscussionTurn("),
  "discussion must return before operator core execution",
);

requireFragments(fastPath, fastSource, [
  "without invoking business workflows or claiming any side effect",
  "strategic_project_context: strategic",
  "execution: null",
  "capability_key: null",
  "varfor",
  "warum",
  "pourquoi",
  "por que",
  "ทำไม",
]);

const oldBlindRepersist = `} else if (\n      !acceptedRecommendation &&\n      CONTEXTUAL_RECOMMENDATION_PATTERN.test(text(options.message))\n    ) {\n      nextAgreementState = agreementWithOperatorRecommendation(`;
assert.ok(
  turnSource.includes(oldBlindRepersist),
  "legacy fallback remains reachable only for non-discussion paths and must stay audited",
);
assert.ok(
  discussionGuard.includes("if (recommendation && discussionKind)"),
  "recommendation discussion must intercept contextual turns before legacy fallback",
);

const contextualStart = turnSource.indexOf(
  "const CONTEXTUAL_RECOMMENDATION_PATTERN",
);
const contextualEnd = turnSource.indexOf("\n\nfunction text", contextualStart);
assert.ok(
  contextualStart >= 0 && contextualEnd > contextualStart,
  "neutral discussion pattern must remain a bounded declaration",
);
const contextualSource = turnSource.slice(contextualStart, contextualEnd);
for (const dangerous of [
  "gor det",
  "mach es",
  "fais le",
  "hazlo",
  "ทำเลย",
]) {
  assert.ok(
    !contextualSource.includes(dangerous),
    `multilingual neutral discussion must not absorb execution phrase ${dangerous}`,
  );
}

console.log("OPERATOR_RECOMMENDATION_DISCUSSION_AUDIT=PASS");
console.log("OPERATOR_RECOMMENDATION_DISCUSSION_RUNTIME=LEGACY_BEHIND_GOVERNED_ROUTER");
console.log("OPERATOR_RECOMMENDATION_DISCUSSION=THINKING_ONLY_NO_EXECUTION");
console.log("OPERATOR_RECOMMENDATION_DISCUSSION_NEUTRAL=EXACT_PENDING_PRESERVED");
console.log("OPERATOR_RECOMMENDATION_DISCUSSION_MULTILINGUAL=SV_DE_FR_ES_TH_PRESERVED");
console.log("OPERATOR_RECOMMENDATION_STATUS_MULTILINGUAL=SV_DE_FR_ES_TH_READ_ONLY");
console.log("OPERATOR_RECOMMENDATION_DISCUSSION_CONTROL=EXECUTION_PHRASES_EXCLUDED");
console.log("OPERATOR_RECOMMENDATION_DISCUSSION_ALTERNATIVE=OLD_PENDING_DISARMED");
console.log("OPERATOR_RECOMMENDATION_DISCUSSION_OLD_RECOMMENDATION=VISIBLE_NOT_EXECUTABLE");
console.log("OPERATOR_RECOMMENDATION_DISCUSSION_CORE_EXECUTION=BYPASSED");
