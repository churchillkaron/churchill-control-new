import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createRecommendationRefinementProposal,
  isRecommendationRefinementMessage,
} from "../lib/operator/runtime/OperatorRecommendationRefinement.js";

const localized = [
  { language: "sv", message: "Vad sägs om att vi använder den säkrare vägen istället?" },
  { language: "de", message: "Wie wäre es mit der sichereren Variante?" },
  { language: "fr", message: "Et si on utilisait l’option plus sûre ?" },
  { language: "es", message: "¿Y si usamos la opción más segura?" },
  { language: "th", message: "แล้วถ้าเราใช้ตัวเลือกที่ปลอดภัยกว่าล่ะ" },
];

for (const item of localized) {
  assert.equal(
    isRecommendationRefinementMessage(item.message),
    true,
    `${item.language} refinement must be recognized`,
  );
}

assert.equal(
  isRecommendationRefinementMessage("What if we use the safer option instead?"),
  true,
  "English refinement must remain recognized",
);

for (const dangerous of [
  "do it",
  "gör det",
  "mach es",
  "fais-le",
  "hazlo",
  "ทำเลย",
]) {
  assert.equal(
    isRecommendationRefinementMessage(dangerous),
    false,
    `execution phrase must not become a refinement: ${dangerous}`,
  );
}

for (const neutral of [
  "why",
  "varför",
  "warum",
  "pourquoi",
  "por qué",
  "ทำไม",
]) {
  assert.equal(
    isRecommendationRefinementMessage(neutral),
    false,
    `neutral discussion must remain discussion-only: ${neutral}`,
  );
}

const previousRecommendation = {
  recommendation_id: "operator_recommendation_refinement_audit",
  capability_key: "platform.example.write",
  description: "Use the original governed direction",
  payload: { id: "example" },
};
const proposalMessage = "Vad sägs om att vi använder den säkrare vägen istället?";
const proposal = createRecommendationRefinementProposal({
  message: proposalMessage,
  recommendation: previousRecommendation,
});

assert.ok(proposal, "refinement proposal must be created");
assert.equal(proposal.proposal_kind, "recommendation_refinement");
assert.equal(proposal.status, "PROPOSED");
assert.equal(proposal.proposal_text, proposalMessage);
assert.equal(
  proposal.previous_recommendation_id,
  previousRecommendation.recommendation_id,
);
assert.equal(
  proposal.previous_capability_key,
  previousRecommendation.capability_key,
);
assert.equal(proposal.authorization_effect, "NONE");
assert.equal(proposal.execution_authorized, false);
assert.equal(proposal.pending_execution_created, false);
assert.equal(proposal.autonomous_run_created, false);
assert.equal(proposal.requires_explicit_decision, true);
assert.equal(
  Object.prototype.hasOwnProperty.call(proposal, "capability_key"),
  false,
  "proposal must not carry an executable capability key",
);
assert.equal(
  Object.prototype.hasOwnProperty.call(proposal, "payload"),
  false,
  "proposal must not carry an executable payload",
);

const turnPath = "lib/operator/runtime/OperatorTurnRuntimeLegacy.js";
const turnSource = await readFile(turnPath, "utf8");
for (const fragment of [
  "OperatorRecommendationRefinement",
  "createRecommendationRefinementProposal",
  "recommendation_refinement_proposal",
  "refinement_authorization_effect",
  "agreementWithRecommendationDisarmed",
  '"DISARMED"',
  "execution_authorized: false",
  "The proposal has no execution authority",
  "make a later explicit decision",
]) {
  assert.ok(turnSource.includes(fragment), `${turnPath} missing ${fragment}`);
}

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
  "agreementWithOperatorRecommendation(",
]) {
  assert.ok(
    !discussionSource.includes(forbidden),
    `refinement discussion must not gain authority through ${forbidden}`,
  );
}
assert.ok(discussionSource.includes("execution: null"));
assert.ok(
  discussionSource.includes(
    "execution: { capability_key: null, payload: {}, reason: null }",
  ),
);
assert.ok(
  discussionSource.includes("createRecommendationRefinementProposal({"),
  "alternative must create only a refinement proposal",
);

const runTurnStart = turnSource.indexOf("export async function runOperatorTurn");
const coreStart = turnSource.indexOf(
  "const coreResult = await runOperatorTurnCore",
  runTurnStart,
);
const guardSource = turnSource.slice(runTurnStart, coreStart);
assert.ok(
  guardSource.includes("return recommendationDiscussionTurn("),
  "refinement discussion must return before core execution",
);

console.log("OPERATOR_RECOMMENDATION_REFINEMENT_AUDIT=PASS");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_RUNTIME=LEGACY_BEHIND_GOVERNED_ROUTER");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_LANGUAGES=SV_DE_FR_ES_TH");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_OLD_PENDING=DISARMED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_OLD_RECOMMENDATION=VISIBLE_NOT_EXECUTABLE");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_PROPOSAL=CONTEXT_ONLY_NO_AUTHORITY");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_AUTHORIZATION=NONE");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_EXECUTION=REQUIRES_LATER_EXPLICIT_DECISION");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CORE_EXECUTION=BYPASSED");
