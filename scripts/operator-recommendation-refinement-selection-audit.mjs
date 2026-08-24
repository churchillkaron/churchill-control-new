import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  agreementWithRecommendationRefinementDecision,
  classifyRecommendationRefinementReply,
  createRecommendationRefinementProposal,
  recommendationRefinementDecisionSafe,
  recommendationRefinementProposalFromAgreementState,
} from "../lib/operator/runtime/OperatorRecommendationRefinement.js";

const previousRecommendation = {
  recommendation_id: "operator_recommendation_refinement_selection_audit",
  capability_key: "platform.example.write",
  description: "Use the original governed direction",
  payload: { id: "example" },
};

const proposal = createRecommendationRefinementProposal({
  message: "What if we use the safer option instead?",
  recommendation: previousRecommendation,
});
assert.ok(proposal);

const baseAgreement = {
  marker: "preserve",
  recommended_action: previousRecommendation,
  recommendation_refinement_proposal: proposal,
};
assert.equal(
  recommendationRefinementDecisionSafe(baseAgreement, proposal),
  true,
  "a proposed refinement with no pending execution/run must be selectable",
);

const localizedSelections = [
  { language: "en", message: "yes, I prefer that" },
  { language: "sv", message: "ja, jag föredrar det" },
  { language: "de", message: "ja, ich bevorzuge das" },
  { language: "fr", message: "oui, je préfère ça" },
  { language: "es", message: "sí, prefiero eso" },
  { language: "th", message: "ใช่ ฉันชอบอันนี้มากกว่า" },
];

for (const item of localizedSelections) {
  assert.equal(
    classifyRecommendationRefinementReply({
      message: item.message,
      agreementState: baseAgreement,
      proposal,
    }),
    "select",
    `${item.language} preference must select the exact proposed direction only`,
  );
}

const selectedAgreement = agreementWithRecommendationRefinementDecision(
  baseAgreement,
  {
    outcome: "select",
    message: "yes, I prefer that",
    proposal,
  },
);
const selected = recommendationRefinementProposalFromAgreementState(
  selectedAgreement,
);
assert.equal(selected?.status, "SELECTED");
assert.equal(selected?.authorization_effect, "NONE");
assert.equal(selected?.execution_authorized, false);
assert.equal(selected?.pending_execution_created, false);
assert.equal(selected?.autonomous_run_created, false);
assert.equal(selected?.requires_explicit_decision, false);
assert.equal(selected?.requires_governed_materialization, true);
assert.equal(selected?.decision_effect, "DIRECTION_ONLY");
assert.equal(selectedAgreement.marker, "preserve");
assert.equal(
  selectedAgreement.recommended_action?.recommendation_id,
  previousRecommendation.recommendation_id,
  "old recommendation may remain visible as context",
);
assert.equal(
  Object.prototype.hasOwnProperty.call(selectedAgreement, "pending_execution"),
  false,
  "selection must not create pending execution",
);
assert.equal(
  Object.prototype.hasOwnProperty.call(selectedAgreement, "autonomous_run"),
  false,
  "selection must not create an autonomous run",
);

for (const phrase of [
  "do it",
  "gör det",
  "mach es",
  "fais-le",
  "hazlo",
  "ทำเลย",
]) {
  assert.equal(
    classifyRecommendationRefinementReply({
      message: phrase,
      agreementState: baseAgreement,
      proposal,
    }),
    null,
    `execution shorthand must not select a refinement: ${phrase}`,
  );
}
assert.equal(
  classifyRecommendationRefinementReply({
    message: "yes, I prefer that",
    agreementState: selectedAgreement,
    proposal: selected,
  }),
  null,
  "a selected proposal must not be selectable again",
);

for (const unsafeState of [
  {
    ...baseAgreement,
    pending_execution: {
      capability_key: "platform.unrelated.write",
      payload: { id: "other" },
    },
  },
  {
    ...baseAgreement,
    autonomous_run: {
      run_id: "operator_run_unrelated",
      run_kind: "single_action",
      status: "awaiting_confirmation",
    },
  },
  {
    ...baseAgreement,
    pending_execution: {},
  },
]) {
  assert.equal(
    recommendationRefinementDecisionSafe(unsafeState, proposal),
    false,
    "any existing pending/run projection must fail refinement selection closed",
  );
  assert.equal(
    classifyRecommendationRefinementReply({
      message: "yes, I prefer that",
      agreementState: unsafeState,
      proposal,
    }),
    null,
  );
}

const rejectedAgreement = agreementWithRecommendationRefinementDecision(
  baseAgreement,
  {
    outcome: "reject",
    message: "keep the original",
    proposal,
  },
);
const rejected = recommendationRefinementProposalFromAgreementState(
  rejectedAgreement,
);
assert.equal(rejected?.status, "REJECTED");
assert.equal(rejected?.authorization_effect, "NONE");
assert.equal(rejected?.decision_effect, "DIRECTION_ONLY");
assert.equal(rejected?.requires_governed_materialization, false);
assert.equal(
  Object.prototype.hasOwnProperty.call(rejectedAgreement, "pending_execution"),
  false,
);

const turnPath = "lib/operator/runtime/OperatorTurnRuntime.js";
const turnSource = await readFile(turnPath, "utf8");
const runTurnStart = turnSource.indexOf("export async function runOperatorTurn");
const proposalRead = turnSource.indexOf(
  "recommendationRefinementProposalFromAgreementState(",
  runTurnStart,
);
const proposalClassify = turnSource.indexOf(
  "classifyRecommendationRefinementReply({",
  proposalRead,
);
const proposalReturn = turnSource.indexOf(
  "return recommendationRefinementDecisionTurn(",
  proposalClassify,
);
const pendingClassify = turnSource.indexOf(
  "const replyClass = pendingReplyClass(",
  proposalReturn,
);
const coreStart = turnSource.indexOf(
  "const coreResult = await runOperatorTurnCore",
  pendingClassify,
);
assert.ok(runTurnStart >= 0);
assert.ok(proposalRead > runTurnStart);
assert.ok(proposalClassify > proposalRead);
assert.ok(proposalReturn > proposalClassify);
assert.ok(
  pendingClassify > proposalReturn,
  "refinement decisions must intercept before stale recommendation shorthand classification",
);
assert.ok(
  coreStart > proposalReturn,
  "refinement decisions must return before operator core execution",
);

const decisionStart = turnSource.indexOf(
  "function recommendationRefinementDecisionTurn",
);
const discussionStart = turnSource.indexOf(
  "function recommendationDiscussionKind",
  decisionStart,
);
assert.ok(decisionStart >= 0 && discussionStart > decisionStart);
const decisionSource = turnSource.slice(decisionStart, discussionStart);
for (const forbidden of [
  "runOperatorTurnCore(",
  "agreementWithOperatorRecommendation(",
  "executeUbteCapability",
]) {
  assert.ok(
    !decisionSource.includes(forbidden),
    `refinement selection must not gain execution authority through ${forbidden}`,
  );
}
assert.ok(decisionSource.includes("execution: null"));
assert.ok(
  decisionSource.includes(
    "execution: { capability_key: null, payload: {}, reason: null }",
  ),
);
for (const required of [
  'refinement_authorization_effect: "NONE"',
  'refinement_decision_effect: "DIRECTION_ONLY"',
  "refinement_requires_governed_materialization: selected",
  "pending_execution_created: false",
  "autonomous_run_created: false",
  "execution_authorized: false",
  "must be materialized into an exact governed action before anything can execute",
]) {
  assert.ok(decisionSource.includes(required), `decision path missing ${required}`);
}

assert.ok(
  turnSource.indexOf("recommendationBindingMismatchTurn", proposalReturn) > proposalReturn,
  "existing binding-mismatch guard must remain after refinement selection intercept",
);

console.log("OPERATOR_RECOMMENDATION_REFINEMENT_SELECTION_AUDIT=PASS");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_SELECTION_LANGUAGES=SV_DE_FR_ES_TH");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_SELECTION=PROPOSED_TO_SELECTED_DIRECTION_ONLY");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_SELECTION_AUTHORIZATION=NONE");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_SELECTION_PENDING=NOT_CREATED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_SELECTION_RUN=NOT_CREATED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_SELECTION_UNSAFE_STATE=FAIL_CLOSED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_SELECTION_EXECUTION_SHORTHAND=NOT_SELECTION");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_SELECTION_MATERIALIZATION=REQUIRED_BEFORE_EXECUTION");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_SELECTION_CORE_EXECUTION=BYPASSED");
