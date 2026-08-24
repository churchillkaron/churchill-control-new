import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  isRecommendationRefinementStatusMessage,
} from "../lib/operator/runtime/OperatorRecommendationRefinement.js";

const localizedStatus = [
  { language: "en", message: "what did we choose" },
  { language: "sv", message: "vad valde vi" },
  { language: "de", message: "was haben wir gewählt" },
  { language: "fr", message: "qu’avons-nous choisi" },
  { language: "es", message: "qué elegimos" },
  { language: "th", message: "เราเลือกอะไร" },
];
for (const item of localizedStatus) {
  assert.equal(
    isRecommendationRefinementStatusMessage(item.message),
    true,
    `${item.language} refinement status must be recognized`,
  );
}

for (const dangerous of [
  "do it",
  "gör det",
  "mach es",
  "fais-le",
  "hazlo",
  "ทำเลย",
  "continue",
  "next",
]) {
  assert.equal(
    isRecommendationRefinementStatusMessage(dangerous),
    false,
    `control phrase must not become a refinement status query: ${dangerous}`,
  );
}

const turnPath = "lib/operator/runtime/OperatorTurnRuntime.js";
const turnSource = await readFile(turnPath, "utf8");
for (const required of [
  "isRecommendationRefinementStatusMessage",
  "recommendationRefinementStatusTurn",
  "recommendation_refinement_status: true",
  "materialized_binding_active: materializedBindingActive",
  "read_only: true",
  "execution_authorized: false",
  "The old pending recommendation is disarmed",
  "It is direction only and has not been turned into a pending action",
  "its pending binding is still active",
  "that exact pending binding is no longer active",
  "I will not replay it from history or shorthand",
]) {
  assert.ok(turnSource.includes(required), `${turnPath} missing ${required}`);
}

const statusStart = turnSource.indexOf(
  "function recommendationRefinementStatusTurn",
);
const mismatchStart = turnSource.indexOf(
  "function recommendationBindingMismatchTurn",
  statusStart,
);
assert.ok(statusStart >= 0 && mismatchStart > statusStart);
const statusSource = turnSource.slice(statusStart, mismatchStart);
for (const forbidden of [
  "runOperatorTurnCore(",
  "executeUbteCapability",
  "agreementWithOperatorRecommendation(",
  "agreementWithRecommendationRefinementDecision(",
  "agreementWithRecommendationRefinementMaterialized(",
]) {
  assert.ok(
    !statusSource.includes(forbidden),
    `refinement status must remain read-only and not call ${forbidden}`,
  );
}
assert.ok(statusSource.includes("execution: null"));
assert.ok(
  statusSource.includes(
    "execution: { capability_key: null, payload: {}, reason: null }",
  ),
);
assert.ok(
  statusSource.includes(
    '!["completed", "cancelled", "superseded"].includes(',
  ),
  "materialized binding status must reject terminal runs",
);

const runTurnStart = turnSource.indexOf("export async function runOperatorTurn");
const statusClassify = turnSource.indexOf(
  "isRecommendationRefinementStatusMessage(options.message)",
  runTurnStart,
);
const statusReturn = turnSource.indexOf(
  "return recommendationRefinementStatusTurn(options, refinementProposal)",
  statusClassify,
);
const projectStatus = turnSource.indexOf(
  "if (isProjectStatusTurn(options.message))",
  statusReturn,
);
const recommendationStatus = turnSource.indexOf(
  "if (isRecommendationStatusTurn(options.message))",
  projectStatus,
);
const coreStart = turnSource.indexOf(
  "const coreResult = await runOperatorTurnCore",
  recommendationStatus,
);
assert.ok(statusClassify > runTurnStart);
assert.ok(statusReturn > statusClassify);
assert.ok(
  projectStatus > statusReturn,
  "exact refinement status must intercept before generic project status",
);
assert.ok(recommendationStatus > projectStatus);
assert.ok(coreStart > statusReturn);

console.log("OPERATOR_RECOMMENDATION_REFINEMENT_STATUS_AUDIT=PASS");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_STATUS_LANGUAGES=SV_DE_FR_ES_TH");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_STATUS=EXACT_STATE_READ_ONLY");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_STATUS_PROPOSED=NO_AUTHORITY");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_STATUS_SELECTED=DIRECTION_ONLY");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_STATUS_MATERIALIZED=ACTIVE_BINDING_CHECKED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_STATUS_TERMINAL=NO_REPLAY");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_STATUS_EXECUTION=NONE");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_STATUS_CORE_EXECUTION=BYPASSED");
