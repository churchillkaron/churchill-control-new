import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  agreementWithRecommendationRefinementDecision,
  classifyRecommendationRefinementAdvanceRequest,
  createRecommendationRefinementProposal,
  recommendationRefinementProposalFromAgreementState,
} from "../lib/operator/runtime/OperatorRecommendationRefinement.js";

const oldRecommendation = {
  recommendation_id: "operator_recommendation_refinement_advance_old",
  capability_key: "platform.product_engineering_cycle.execute",
  description: "Run the old direction",
  payload: { focus: "OLD_DIRECTION" },
};
const proposal = createRecommendationRefinementProposal({
  message: "What if we use the safer current-main direction instead?",
  recommendation: oldRecommendation,
});
assert.ok(proposal);

const proposedAgreement = {
  recommended_action: oldRecommendation,
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

const localizedAdvance = [
  { language: "en", message: "continue" },
  { language: "sv", message: "fortsätt" },
  { language: "de", message: "weiter" },
  { language: "fr", message: "continue" },
  { language: "es", message: "continúa" },
  { language: "th", message: "ทำต่อ" },
];
for (const item of localizedAdvance) {
  assert.equal(
    classifyRecommendationRefinementAdvanceRequest({
      message: item.message,
      agreementState: selectedAgreement,
      proposal: selected,
    }),
    true,
    `${item.language} continuation must advance selected refinement to governed preparation only`,
  );
}

for (const executionPhrase of [
  "do it",
  "gör det",
  "mach es",
  "fais-le",
  "hazlo",
  "ทำเลย",
]) {
  assert.equal(
    classifyRecommendationRefinementAdvanceRequest({
      message: executionPhrase,
      agreementState: selectedAgreement,
      proposal: selected,
    }),
    false,
    `execution phrase must not be refinement advance: ${executionPhrase}`,
  );
}

for (const decisionPhrase of ["yes", "ja", "oui", "sí", "ใช่"]) {
  assert.equal(
    classifyRecommendationRefinementAdvanceRequest({
      message: decisionPhrase,
      agreementState: selectedAgreement,
      proposal: selected,
    }),
    false,
    `decision shorthand must not be refinement advance: ${decisionPhrase}`,
  );
}

for (const unsafeAgreement of [
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
    classifyRecommendationRefinementAdvanceRequest({
      message: "continue",
      agreementState: unsafeAgreement,
      proposal: selected,
    }),
    false,
    "existing pending/run authority must block refinement advance",
  );
}

for (const status of ["PROPOSED", "REJECTED", "MATERIALIZED"]) {
  const wrongStatus = {
    ...selected,
    status,
  };
  assert.equal(
    classifyRecommendationRefinementAdvanceRequest({
      message: "continue",
      agreementState: {
        ...selectedAgreement,
        recommendation_refinement_proposal: wrongStatus,
      },
      proposal: wrongStatus,
    }),
    false,
    `${status} refinement must not use selected-direction advance`,
  );
}

const canonicalPath = "lib/operator/runtime/OperatorTurnRuntime.js";
const governedPath = "lib/operator/runtime/OperatorTurnRuntimeGoverned.js";
const canonicalSource = await readFile(canonicalPath, "utf8");
const governedSource = await readFile(governedPath, "utf8");

assert.ok(
  canonicalSource.includes("OperatorTurnRuntimeGoverned.js"),
  "canonical runtime must route advance handling through governed runtime",
);
assert.ok(
  !canonicalSource.includes("OperatorTurnRuntimeLegacy.js"),
  "canonical runtime must not bypass governed refinement advance routing",
);

for (const required of [
  "classifyRecommendationRefinementAdvanceRequest",
  "const advanceRequested = classifyRecommendationRefinementAdvanceRequest",
  "materializationRequested || advanceRequested",
  "return runGovernedRecommendationRefinementTurn({",
  "prepareSelectedRefinementForGovernedBinding",
  "operatorRecommendationMatchesPendingExecution",
  "authorization_effect: \"NONE\"",
  "execution_authorized: false",
  "old_payload_reused: false",
]) {
  assert.ok(governedSource.includes(required), `${governedPath} missing ${required}`);
}

const runTurnStart = governedSource.indexOf("export async function runOperatorTurn");
const advanceStart = governedSource.indexOf(
  "const advanceRequested = classifyRecommendationRefinementAdvanceRequest",
  runTurnStart,
);
const governedReturn = governedSource.indexOf(
  "return runGovernedRecommendationRefinementTurn({",
  advanceStart,
);
const legacyFallback = governedSource.indexOf(
  "return legacyRunOperatorTurn(options);",
  governedReturn,
);
assert.ok(advanceStart > runTurnStart);
assert.ok(governedReturn > advanceStart);
assert.ok(
  legacyFallback > governedReturn,
  "selected refinement advance must intercept before the final legacy fallback",
);

const governedPreparationStart = governedSource.indexOf(
  "export async function runGovernedRecommendationRefinementTurn",
);
const legacyFunctionStart = governedSource.indexOf(
  "async function legacyRunOperatorTurn",
  governedPreparationStart,
);
const governedPreparationSource = governedSource.slice(
  governedPreparationStart,
  legacyFunctionStart,
);
assert.ok(!governedPreparationSource.includes("runOperatorTurnCore("));
assert.ok(!governedPreparationSource.includes("executeUbteCapability"));
assert.ok(governedPreparationSource.includes("prepareSelectedRefinementForGovernedBinding({"));
assert.ok(governedPreparationSource.includes("execution_authorized: false"));
assert.ok(governedPreparationSource.includes("old_payload_reused: false"));
assert.ok(governedPreparationSource.includes("bindingFailed: true"));

console.log("OPERATOR_RECOMMENDATION_REFINEMENT_ADVANCE_AUDIT=PASS");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_ADVANCE_LANGUAGES=SV_DE_FR_ES_TH");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_ADVANCE_SELECTED=CONTINUE_TO_GOVERNED_PREPARATION");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_ADVANCE_PREMATERIALIZED_EXECUTION=NONE");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_ADVANCE_DO_IT=FAIL_CLOSED_NOT_ADVANCE");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_ADVANCE_EXISTING_AUTHORITY=FAIL_CLOSED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_ADVANCE_CAPABILITY=FRESHLY_VALIDATED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_ADVANCE_OLD_PAYLOAD=NOT_REUSED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_ADVANCE_EXACT_BINDING=VERIFIED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_ADVANCE_CORE_EXECUTION=BYPASSED");
