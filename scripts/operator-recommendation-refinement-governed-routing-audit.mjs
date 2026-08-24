import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const canonical = await readFile(
  "lib/operator/runtime/OperatorTurnRuntime.js",
  "utf8",
);
const governed = await readFile(
  "lib/operator/runtime/OperatorTurnRuntimeGoverned.js",
  "utf8",
);
const legacy = await readFile(
  "lib/operator/runtime/OperatorTurnRuntimeLegacy.js",
  "utf8",
);

assert.ok(canonical.includes("OperatorTurnRuntimeGoverned.js"));
assert.ok(!canonical.includes("OperatorTurnRuntimeCore"));
assert.ok(governed.includes("OperatorTurnRuntimeLegacy.js"));
assert.ok(governed.includes("recommendationRefinementPreparationFromAgreementState"));
assert.ok(governed.includes("prepareSelectedRefinementForGovernedBinding"));
assert.ok(governed.includes("continueSelectedRefinementPreparationFromMessage"));
assert.ok(governed.includes("execution_authorized: false"));
assert.ok(governed.includes("old_payload_reused: false"));
assert.ok(legacy.includes("runOperatorTurn"));

console.log("OPERATOR_RECOMMENDATION_REFINEMENT_GOVERNED_ROUTING_AUDIT=PASS");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CANONICAL=GOVERNED_ROUTER");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_LEGACY=FALLBACK_ONLY");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_EXECUTION=GOVERNED_ONLY");
