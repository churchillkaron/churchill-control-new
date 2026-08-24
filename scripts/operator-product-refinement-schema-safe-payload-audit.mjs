import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const contractPath =
  "lib/operator/contracts/OperatorRecommendationRefinementState.js";
const source = await readFile(contractPath, "utf8");
for (const required of [
  "resolveRecommendationRefinementPayload",
  "PRODUCT_ENGINEERING_REFINEMENT_CAPABILITY",
  'focus: { type: "string", maxLength: 2000 }',
  'required: ["focus"]',
  "const payloadResolution = resolveRecommendationRefinementPayload({",
  "payloadResolution.ready !== true",
  "payloadResolution.old_payload_reused !== false",
  "payload: payloadResolution.payload",
  "payload_resolution_source: payloadResolution.source",
  "old_payload_reused: false",
]) {
  assert.ok(source.includes(required), `${contractPath} missing ${required}`);
}

const {
  productEngineeringRecommendationFromRefinement,
} = await import(
  "@/lib/operator/contracts/OperatorRecommendationRefinementState"
);

const focus = "reassess actual current main and harden refinement payload safety";
const recommendation = productEngineeringRecommendationFromRefinement({
  status: "PROPOSED_PRODUCT_ENGINEERING_REFINEMENT",
  capability_key: "platform.product_engineering_cycle.execute",
  proposed_focus: focus,
  previous_recommendation_id: "recommendation_previous",
  previous_focus: "previous focus",
  previous_description: "previous recommendation",
  automatic_execution_started: false,
  authorization_effect: "NONE",
  current_main_reassessment_required: true,
  focus_is_priority_context_only: true,
});
assert.ok(recommendation);
assert.equal(
  recommendation.capability_key,
  "platform.product_engineering_cycle.execute",
);
assert.deepEqual(recommendation.payload, { focus });
assert.equal(
  recommendation.payload_resolution_source,
  "selected_refinement_schema_safe_payload",
);
assert.equal(recommendation.old_payload_reused, false);
assert.equal(recommendation.original_message, focus);
assert.equal(recommendation.objective, focus);
assert.equal(recommendation.source, "product_engineering_discussion_refinement");
assert.equal(
  Object.prototype.hasOwnProperty.call(recommendation.payload, "previous_focus"),
  false,
);

console.log("OPERATOR_PRODUCT_REFINEMENT_SCHEMA_SAFE_PAYLOAD_AUDIT=PASS");
console.log("OPERATOR_PRODUCT_REFINEMENT_PAYLOAD=SCHEMA_RESOLVED_FOCUS_ONLY");
console.log("OPERATOR_PRODUCT_REFINEMENT_OLD_PAYLOAD=NOT_REUSED");
console.log("OPERATOR_PRODUCT_REFINEMENT_EXECUTION=UNCHANGED_GOVERNED_LATER");
