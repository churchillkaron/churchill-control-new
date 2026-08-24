import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  agreementWithRecommendationRefinementDecision,
  agreementWithRecommendationRefinementMaterialized,
  classifyRecommendationRefinementMaterializationRequest,
  createRecommendationRefinementProposal,
  recommendationRefinementMaterializationSafe,
  recommendationRefinementProposalFromAgreementState,
} from "../lib/operator/runtime/OperatorRecommendationRefinement.js";

const previousRecommendation = {
  recommendation_id: "operator_recommendation_materialization_old",
  capability_key: "platform.product_engineering_cycle.execute",
  description: "Run the old engineering direction",
  payload: { focus: "OLD_PAYLOAD_MUST_NOT_BE_REUSED" },
};
const proposal = createRecommendationRefinementProposal({
  message: "What if we use the safer current-main objective instead?",
  recommendation: previousRecommendation,
});
assert.ok(proposal);

const proposedAgreement = {
  marker: "preserve",
  recommended_action: previousRecommendation,
  recommendation_refinement_proposal: proposal,
};
const selectedAgreement = agreementWithRecommendationRefinementDecision(
  proposedAgreement,
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
assert.equal(
  recommendationRefinementMaterializationSafe(selectedAgreement, selected),
  true,
);

const localizedMaterialization = [
  { language: "en", message: "make that the new recommendation" },
  { language: "sv", message: "gör det till den nya rekommendationen" },
  { language: "de", message: "mach das zur neuen Empfehlung" },
  { language: "fr", message: "fais-en la nouvelle recommandation" },
  { language: "es", message: "haz que esa sea la nueva recomendación" },
  { language: "th", message: "ทำให้เป็นคำแนะนำใหม่" },
];

for (const item of localizedMaterialization) {
  assert.equal(
    classifyRecommendationRefinementMaterializationRequest({
      message: item.message,
      agreementState: selectedAgreement,
      proposal: selected,
    }),
    true,
    `${item.language} explicit materialization request must be recognized`,
  );
}

for (const shorthand of [
  "do it",
  "gör det",
  "mach es",
  "fais-le",
  "hazlo",
  "ทำเลย",
  "yes",
  "ja",
  "oui",
  "sí",
  "ใช่",
]) {
  assert.equal(
    classifyRecommendationRefinementMaterializationRequest({
      message: shorthand,
      agreementState: selectedAgreement,
      proposal: selected,
    }),
    false,
    `shorthand must not materialize selected direction: ${shorthand}`,
  );
}

for (const unsafeState of [
  {
    ...selectedAgreement,
    pending_execution: {
      capability_key: "platform.unrelated.write",
      payload: {},
    },
  },
  {
    ...selectedAgreement,
    autonomous_run: {
      run_id: "operator_run_unrelated",
      run_kind: "single_action",
      status: "awaiting_confirmation",
    },
  },
]) {
  assert.equal(
    recommendationRefinementMaterializationSafe(unsafeState, selected),
    false,
    "materialization must fail closed when any pending/run authority already exists",
  );
  assert.equal(
    classifyRecommendationRefinementMaterializationRequest({
      message: "make that the new recommendation",
      agreementState: unsafeState,
      proposal: selected,
    }),
    false,
  );
}

const newRecommendation = {
  recommendation_id: "operator_recommendation_materialization_new",
  capability_key: "platform.product_engineering_cycle.execute",
  description: "Run the selected fresh engineering direction",
  payload: { focus: selected.proposal_text },
};
const boundAgreement = {
  ...selectedAgreement,
  recommended_action: newRecommendation,
  pending_execution: {
    recommendation_id: newRecommendation.recommendation_id,
    capability_key: newRecommendation.capability_key,
    payload: newRecommendation.payload,
  },
  autonomous_run: {
    run_id: "operator_run_materialization_new",
    run_kind: "single_action",
    status: "awaiting_confirmation",
  },
};
const materializedAgreement = agreementWithRecommendationRefinementMaterialized(
  boundAgreement,
  newRecommendation,
);
const materialized = recommendationRefinementProposalFromAgreementState(
  materializedAgreement,
);
assert.equal(materialized?.status, "MATERIALIZED");
assert.equal(materialized?.authorization_effect, "NONE");
assert.equal(materialized?.execution_authorized, false);
assert.equal(materialized?.pending_execution_created, true);
assert.equal(materialized?.autonomous_run_created, true);
assert.equal(
  materialized?.materialization_effect,
  "GOVERNED_PENDING_RECOMMENDATION_CREATED",
);
assert.equal(
  materialized?.materialized_recommendation_id,
  newRecommendation.recommendation_id,
);
assert.equal(
  materialized?.materialized_capability_key,
  newRecommendation.capability_key,
);
assert.equal(materializedAgreement.marker, "preserve");
assert.equal(
  materializedAgreement.pending_execution.payload.focus,
  selected.proposal_text,
  "materialized Product Engineering payload must be derived from selected proposal",
);
assert.notEqual(
  materializedAgreement.pending_execution.payload.focus,
  previousRecommendation.payload.focus,
  "old recommendation payload must not be reused",
);

for (const mismatch of [
  {
    ...boundAgreement,
    pending_execution: {
      ...boundAgreement.pending_execution,
      recommendation_id: "wrong_recommendation",
    },
  },
  {
    ...boundAgreement,
    pending_execution: {
      ...boundAgreement.pending_execution,
      capability_key: "platform.other.write",
    },
  },
  {
    ...boundAgreement,
    autonomous_run: {
      ...boundAgreement.autonomous_run,
      run_kind: "mission",
    },
  },
]) {
  const unchanged = agreementWithRecommendationRefinementMaterialized(
    mismatch,
    newRecommendation,
  );
  assert.equal(
    recommendationRefinementProposalFromAgreementState(unchanged)?.status,
    "SELECTED",
    "mismatched pending/run evidence must not mark proposal MATERIALIZED",
  );
}

const turnPath = "lib/operator/runtime/OperatorTurnRuntime.js";
const turnSource = await readFile(turnPath, "utf8");
for (const required of [
  "classifyRecommendationRefinementMaterializationRequest",
  "agreementWithRecommendationRefinementMaterialized",
  "recommendationRefinementMaterializationTurn",
  'source: "selected_refinement_materialization"',
  "capability_freshly_validated: true",
  "old_payload_reused: false",
  "missing_inputs_guessed: false",
  "I will not reuse the old payload or guess missing fields",
]) {
  assert.ok(turnSource.includes(required), `${turnPath} missing ${required}`);
}

const materializeStart = turnSource.indexOf(
  "async function recommendationRefinementMaterializationTurn",
);
const continuationStart = turnSource.indexOf(
  "function continuationCapabilityResult",
  materializeStart,
);
assert.ok(materializeStart >= 0 && continuationStart > materializeStart);
const materializeSource = turnSource.slice(materializeStart, continuationStart);
assert.ok(
  !materializeSource.includes("runOperatorTurnCore("),
  "materialization turn must not execute through Operator Core",
);
assert.ok(
  !materializeSource.includes("executeUbteCapability"),
  "materialization turn must not directly execute a capability",
);
assert.ok(materializeSource.includes("safeRecommendationCapabilities(options)"));
assert.ok(materializeSource.includes("validatedRecommendation("));
assert.ok(
  materializeSource.includes(
    "text(capability?.key) === PRODUCT_ENGINEERING_CYCLE_KEY",
  ),
);
assert.ok(materializeSource.includes("? { focus: proposalText }"));
assert.ok(materializeSource.includes(": {}"));
assert.ok(materializeSource.includes("execution: null"));
assert.ok(
  materializeSource.includes(
    "execution: { capability_key: null, payload: {}, reason: null }",
  ),
);
assert.ok(
  materializeSource.includes("pending_execution_created: true"),
  "successful materialization should create governed pending state",
);
assert.ok(
  materializeSource.includes("autonomous_run_created: true"),
  "successful materialization should create the governed single-action run",
);
assert.ok(
  materializeSource.includes("execution_authorized: false"),
  "materialization itself must not authorize execution",
);

const runTurnStart = turnSource.indexOf("export async function runOperatorTurn");
const materializeClassify = turnSource.indexOf(
  "classifyRecommendationRefinementMaterializationRequest({",
  runTurnStart,
);
const materializeReturn = turnSource.indexOf(
  "return recommendationRefinementMaterializationTurn(",
  materializeClassify,
);
const refinementReply = turnSource.indexOf(
  "const refinementReply = classifyRecommendationRefinementReply({",
  materializeReturn,
);
const pendingReply = turnSource.indexOf(
  "const replyClass = pendingReplyClass(",
  refinementReply,
);
const coreStart = turnSource.indexOf(
  "const coreResult = await runOperatorTurnCore",
  pendingReply,
);
assert.ok(materializeClassify > runTurnStart);
assert.ok(materializeReturn > materializeClassify);
assert.ok(refinementReply > materializeReturn);
assert.ok(pendingReply > materializeReturn);
assert.ok(coreStart > materializeReturn);

console.log("OPERATOR_RECOMMENDATION_REFINEMENT_MATERIALIZATION_AUDIT=PASS");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_MATERIALIZATION_LANGUAGES=SV_DE_FR_ES_TH");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_MATERIALIZATION_TRIGGER=EXPLICIT_ONLY");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_MATERIALIZATION_SHORTHAND=EXCLUDED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_MATERIALIZATION_CAPABILITY=FRESHLY_VALIDATED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_MATERIALIZATION_OLD_PAYLOAD=NOT_REUSED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_MATERIALIZATION_MISSING_INPUTS=FAIL_CLOSED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_MATERIALIZATION_PENDING=NEW_GOVERNED_BINDING");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_MATERIALIZATION_EXECUTION=NOT_AUTHORIZED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_MATERIALIZATION_CORE_EXECUTION=BYPASSED");
