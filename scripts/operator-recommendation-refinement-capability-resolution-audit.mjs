import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  resolveRecommendationRefinementCapability,
} from "../lib/operator/runtime/OperatorRecommendationRefinementCapabilityResolver.js";

const oldCapability = {
  key: "platform.old_action.write",
  mode: "write",
  name: "Old action",
  description: "Run the old legacy action",
  operator_aliases: ["old action"],
};
const newCapability = {
  key: "platform.new_action.write",
  mode: "write",
  name: "Safer replacement action",
  description: "Use the safer replacement action",
  operator_aliases: ["safer replacement action"],
};
const ambiguousA = {
  key: "platform.option_a.write",
  mode: "write",
  name: "Review option",
  description: "Review an option",
};
const ambiguousB = {
  key: "platform.option_b.write",
  mode: "write",
  name: "Review alternative",
  description: "Review an alternative",
};

const normal = resolveRecommendationRefinementCapability({
  proposal: {
    status: "SELECTED",
    proposal_text: "Use the safer replacement action",
    previous_capability_key: oldCapability.key,
    selection_origin: "REFINEMENT_PROPOSAL",
  },
  capabilities: [oldCapability, newCapability],
});
assert.equal(normal.capability?.key, newCapability.key);
assert.equal(normal.resolution_kind, "FRESH_STRONG_CATALOG_RANKING");
assert.equal(normal.resolution_text_source, "SELECTED_REFINEMENT_PROPOSAL");
assert.equal(normal.strong_match, true);
assert.equal(normal.old_capability_identity_reused, false);
assert.notEqual(normal.capability?.key, oldCapability.key);

const clarified = resolveRecommendationRefinementCapability({
  proposal: {
    status: "SELECTED",
    proposal_text: "Keep the refined business objective exactly as written",
    capability_resolution_text: "Safer replacement action",
    previous_capability_key: oldCapability.key,
    selection_origin: "REFINEMENT_PROPOSAL",
  },
  capabilities: [oldCapability, newCapability],
});
assert.equal(clarified.capability?.key, newCapability.key);
assert.equal(clarified.strong_match, true);
assert.equal(
  clarified.resolution_text_source,
  "EXPLICIT_CAPABILITY_CLARIFICATION",
);
assert.equal(clarified.old_capability_identity_reused, false);

const ambiguous = resolveRecommendationRefinementCapability({
  proposal: {
    status: "SELECTED",
    proposal_text: "review",
    previous_capability_key: oldCapability.key,
    selection_origin: "REFINEMENT_PROPOSAL",
  },
  capabilities: [ambiguousA, ambiguousB],
});
assert.equal(ambiguous.capability, null);
assert.equal(ambiguous.strong_match, false);
assert.equal(ambiguous.old_capability_identity_reused, false);

const restored = resolveRecommendationRefinementCapability({
  proposal: {
    status: "SELECTED",
    proposal_text: "Use the original direction",
    previous_capability_key: oldCapability.key,
    selection_origin: "ORIGINAL_RECOMMENDATION_CONTEXT",
  },
  capabilities: [oldCapability, newCapability],
});
assert.equal(restored.capability?.key, oldCapability.key);
assert.equal(restored.resolution_kind, "RESTORED_ORIGINAL_FRESH_IDENTITY");
assert.equal(restored.resolution_text_source, "RESTORED_ORIGINAL_IDENTITY");
assert.equal(restored.old_capability_identity_reused, true);
assert.equal(restored.ranked_candidate_count, 0);

const missingRestore = resolveRecommendationRefinementCapability({
  proposal: {
    status: "SELECTED",
    proposal_text: "Use the original direction",
    previous_capability_key: "platform.missing.write",
    selection_origin: "ORIGINAL_RECOMMENDATION_CONTEXT",
  },
  capabilities: [oldCapability, newCapability],
});
assert.equal(missingRestore.capability, null);
assert.equal(missingRestore.strong_match, false);

const canonicalSource = await readFile(
  "lib/operator/runtime/OperatorTurnRuntime.js",
  "utf8",
);
const governedSource = await readFile(
  "lib/operator/runtime/OperatorTurnRuntimeGoverned.js",
  "utf8",
);
const bridgeSource = await readFile(
  "lib/operator/runtime/OperatorRecommendationRefinementPreparationBridge.js",
  "utf8",
);
const preparationRuntimeSource = await readFile(
  "lib/operator/runtime/OperatorRecommendationRefinementPreparationRuntime.js",
  "utf8",
);

assert.ok(
  canonicalSource.includes(
    'from "./OperatorTurnRuntimeGoverned.js"',
  ),
  "canonical runtime must route through the governed refinement entrypoint",
);
assert.ok(
  !canonicalSource.includes("OperatorTurnRuntimeLegacy"),
  "canonical runtime must not bypass the governed router",
);
assert.ok(
  governedSource.includes(
    'await import("./OperatorTurnRuntimeLegacy.js")',
  ),
  "legacy behavior must be fallback-only behind the governed router",
);
assert.ok(
  governedSource.includes("recommendationRefinementPreparationFromAgreementState"),
);
assert.ok(
  governedSource.includes("continueSelectedRefinementPreparationFromMessage"),
);
assert.ok(
  governedSource.includes("prepareSelectedRefinementForGovernedBinding"),
);
assert.ok(governedSource.includes("listOperatorCapabilities()"));
assert.ok(governedSource.includes("execution_authorized: false"));
assert.ok(governedSource.includes("old_payload_reused: false"));
assert.ok(
  !governedSource.includes("proposal?.previous_capability_key"),
  "governed normal materialization must never directly inherit the old key",
);
assert.ok(
  bridgeSource.includes("prepareRecommendationRefinement({"),
  "bridge must delegate capability resolution to the hardened preparation runtime",
);
assert.ok(
  preparationRuntimeSource.includes("planRecommendationRefinementMaterialization({"),
);
assert.ok(
  preparationRuntimeSource.includes("filterRecommendationRefinementCapabilitiesForActor({"),
);
assert.ok(
  !governedSource.includes("runOperatorTurnCore("),
  "governed refinement routing must not execute core runtime directly",
);

console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CAPABILITY_RESOLUTION_AUDIT=PASS");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CAPABILITY_RESOLUTION_NORMAL=FRESH_STRONG_RANKING");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CAPABILITY_RESOLUTION_CLARIFICATION=EXPLICIT_WITH_PAYLOAD_INTENT_PRESERVED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CAPABILITY_RESOLUTION_RESTORE=FRESH_IDENTITY_LOOKUP");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CAPABILITY_RESOLUTION_OLD_KEY=NORMAL_ALTERNATIVE_CANNOT_BYPASS_RANKING");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CAPABILITY_RESOLUTION_AMBIGUOUS=FAIL_CLOSED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CAPABILITY_RESOLUTION_OLD_PAYLOAD=NOT_REUSED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CAPABILITY_RESOLUTION_EXECUTION=NONE");
