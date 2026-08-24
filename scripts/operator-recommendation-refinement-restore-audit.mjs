import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  agreementWithRecommendationRefinementDecision,
  classifyRecommendationRefinementAdvanceRequest,
  classifyRecommendationRefinementReply,
  createRecommendationRefinementProposal,
  recommendationRefinementProposalFromAgreementState,
} from "../lib/operator/runtime/OperatorRecommendationRefinement.js";
import {
  resolveRecommendationRefinementPayload,
} from "../lib/operator/runtime/OperatorRecommendationRefinementPayloadResolver.js";

const oldRecommendation = {
  recommendation_id: "operator_recommendation_restore_old",
  capability_key: "platform.product_engineering_cycle.execute",
  description: "Use the original bounded engineering objective",
  payload: { focus: "OLD_PAYLOAD_MUST_NOT_RETURN" },
};
const proposal = createRecommendationRefinementProposal({
  message: "What if we use a different engineering direction instead?",
  recommendation: oldRecommendation,
});
assert.ok(proposal);
assert.equal(
  proposal.previous_recommendation_description,
  oldRecommendation.description,
);
assert.equal(
  Object.prototype.hasOwnProperty.call(proposal, "previous_payload"),
  false,
  "refinement proposal must not store the old executable payload",
);

const agreement = {
  marker: "preserve",
  recommended_action: oldRecommendation,
  recommendation_refinement_proposal: proposal,
};
const localizedRestore = [
  { language: "en", message: "keep the original" },
  { language: "sv", message: "behåll den gamla rekommendationen" },
  { language: "de", message: "behalte die alte Empfehlung" },
  { language: "fr", message: "garde l’ancienne recommandation" },
  { language: "es", message: "volvamos a la recomendación original" },
  { language: "th", message: "ใช้คำแนะนำเดิม" },
];
for (const item of localizedRestore) {
  assert.equal(
    classifyRecommendationRefinementReply({
      message: item.message,
      agreementState: agreement,
      proposal,
    }),
    "restore_original",
    `${item.language} explicit original restoration must be distinguished from rejection`,
  );
}

const restoredAgreement = agreementWithRecommendationRefinementDecision(
  agreement,
  {
    outcome: "restore_original",
    message: "keep the original",
    proposal,
  },
);
const restored = recommendationRefinementProposalFromAgreementState(
  restoredAgreement,
);
assert.equal(restored?.status, "SELECTED");
assert.equal(restored?.proposal_text, oldRecommendation.description);
assert.equal(restored?.selection_origin, "ORIGINAL_RECOMMENDATION_CONTEXT");
assert.equal(restored?.previous_capability_key, oldRecommendation.capability_key);
assert.equal(restored?.authorization_effect, "NONE");
assert.equal(restored?.execution_authorized, false);
assert.equal(restored?.pending_execution_created, false);
assert.equal(restored?.autonomous_run_created, false);
assert.equal(restored?.requires_governed_materialization, true);
assert.equal(restoredAgreement.marker, "preserve");
assert.equal(
  Object.prototype.hasOwnProperty.call(restoredAgreement, "pending_execution"),
  false,
  "restoring original direction must not revive pending execution",
);
assert.equal(
  Object.prototype.hasOwnProperty.call(restoredAgreement, "autonomous_run"),
  false,
  "restoring original direction must not revive the old run",
);
assert.equal(
  Object.prototype.hasOwnProperty.call(restored, "payload"),
  false,
  "restored direction must not contain executable payload",
);

assert.equal(
  classifyRecommendationRefinementAdvanceRequest({
    message: "continue",
    agreementState: restoredAgreement,
    proposal: restored,
  }),
  true,
  "natural continuation may freshly materialize the restored direction",
);
assert.equal(
  classifyRecommendationRefinementAdvanceRequest({
    message: "do it",
    agreementState: restoredAgreement,
    proposal: restored,
  }),
  false,
  "do it must not skip materialization after original-direction restoration",
);

const plainReject = agreementWithRecommendationRefinementDecision(
  agreement,
  {
    outcome: "reject",
    message: "no",
    proposal,
  },
);
assert.equal(
  recommendationRefinementProposalFromAgreementState(plainReject)?.status,
  "REJECTED",
  "plain rejection must remain different from restoring original direction",
);

const freshPayload = resolveRecommendationRefinementPayload({
  proposal: restored,
  capability: {
    key: oldRecommendation.capability_key,
    input_schema: {
      type: "object",
      properties: { focus: { type: "string" } },
      required: ["focus"],
    },
  },
});
assert.equal(freshPayload.ready, true);
assert.deepEqual(freshPayload.payload, { focus: oldRecommendation.description });
assert.equal(freshPayload.old_payload_reused, false);
assert.notEqual(
  freshPayload.payload.focus,
  oldRecommendation.payload.focus,
  "restored Product Engineering direction must derive fresh focus from direction text rather than revive the old payload",
);

const legacyPath = "lib/operator/runtime/OperatorTurnRuntimeLegacy.js";
const governedPath = "lib/operator/runtime/OperatorTurnRuntimeGoverned.js";
const [legacySource, governedSource] = await Promise.all([
  readFile(legacyPath, "utf8"),
  readFile(governedPath, "utf8"),
]);

const decisionStart = legacySource.indexOf(
  "function recommendationRefinementDecisionTurn",
);
const discussionStart = legacySource.indexOf(
  "function recommendationDiscussionKind",
  decisionStart,
);
assert.ok(decisionStart >= 0 && discussionStart > decisionStart);
const decisionSource = legacySource.slice(decisionStart, discussionStart);
for (const required of [
  'const restoredOriginal = outcome === "restore_original"',
  'const selected = outcome === "select" || restoredOriginal',
  "refinement_restored_original: restoredOriginal",
  "old_payload_reused: false",
  "I did not revive its old payload or create pending execution",
]) {
  assert.ok(decisionSource.includes(required), `restore path missing ${required}`);
}
for (const forbidden of [
  "runOperatorTurnCore(",
  "executeUbteCapability",
  "agreementWithOperatorRecommendation(",
]) {
  assert.ok(
    !decisionSource.includes(forbidden),
    `restore-original decision must not gain authority through ${forbidden}`,
  );
}
assert.ok(decisionSource.includes("execution: null"));
assert.ok(
  decisionSource.includes(
    "execution: { capability_key: null, payload: {}, reason: null }",
  ),
);

for (const required of [
  "classifyRecommendationRefinementAdvanceRequest",
  "listOperatorCapabilities",
  "runGovernedRecommendationRefinementTurn",
  "prepareSelectedRefinementForGovernedBinding",
  "result?.old_payload_reused !== false",
  "operatorRecommendationMatchesPendingExecution",
  "capability_freshly_validated: ready",
  "old_payload_reused: false",
  "execution_authorized: false",
  "materializationRequested || advanceRequested",
]) {
  assert.ok(
    governedSource.includes(required),
    `${governedPath} missing governed restore/materialization guard ${required}`,
  );
}
for (const forbidden of ["executeUbteCapability", "runOperatorTurnCore("]) {
  assert.ok(
    !governedSource.includes(forbidden),
    `governed refinement preparation must bind without executing through ${forbidden}`,
  );
}

console.log("OPERATOR_RECOMMENDATION_REFINEMENT_RESTORE_AUDIT=PASS");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_RESTORE_RUNTIME=LEGACY_DECISION_GOVERNED_MATERIALIZATION");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_RESTORE_LANGUAGES=SV_DE_FR_ES_TH");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_RESTORE=ORIGINAL_DIRECTION_ONLY");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_RESTORE_OLD_PAYLOAD=NOT_RESTORED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_RESTORE_PENDING=NOT_REVIVED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_RESTORE_RUN=NOT_REVIVED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_RESTORE_CONTINUE=FRESH_MATERIALIZATION");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_RESTORE_DO_IT=FAIL_CLOSED_PREMATERIALIZATION");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_RESTORE_EXECUTION=NONE");
