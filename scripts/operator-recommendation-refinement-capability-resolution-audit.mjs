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
assert.equal(normal.strong_match, true);
assert.equal(normal.old_capability_identity_reused, false);
assert.notEqual(normal.capability?.key, oldCapability.key);

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

const turnPath = "lib/operator/runtime/OperatorTurnRuntime.js";
const turnSource = await readFile(turnPath, "utf8");
assert.ok(
  turnSource.includes("resolveRecommendationRefinementCapability"),
  "runtime must use the fresh refinement capability resolver",
);
const materializeStart = turnSource.indexOf(
  "async function recommendationRefinementMaterializationTurn",
);
const continuationStart = turnSource.indexOf(
  "function continuationCapabilityResult",
  materializeStart,
);
assert.ok(materializeStart >= 0 && continuationStart > materializeStart);
const materializeSource = turnSource.slice(materializeStart, continuationStart);
assert.ok(materializeSource.includes("const capabilityResolution ="));
assert.ok(materializeSource.includes("resolveRecommendationRefinementCapability({"));
assert.ok(materializeSource.includes("capabilities: safeCapabilities"));
assert.ok(materializeSource.includes("const capability = capabilityResolution.capability"));
assert.ok(
  !materializeSource.includes(
    "capabilityByKey(\n    safeCapabilities,\n    proposal?.previous_capability_key",
  ),
  "normal materialization must not directly inherit the old capability key",
);
assert.ok(materializeSource.includes("old_payload_reused: false"));
assert.ok(materializeSource.includes("? { focus: proposalText }"));
assert.ok(materializeSource.includes("execution_authorized: false"));
assert.ok(materializeSource.includes("refinement_capability_resolution:"));
assert.ok(materializeSource.includes("refinement_capability_strong_match:"));
assert.ok(materializeSource.includes("refinement_old_capability_identity_reused:"));
assert.ok(!materializeSource.includes("runOperatorTurnCore("));

console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CAPABILITY_RESOLUTION_AUDIT=PASS");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CAPABILITY_RESOLUTION_NORMAL=FRESH_STRONG_RANKING");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CAPABILITY_RESOLUTION_RESTORE=FRESH_IDENTITY_LOOKUP");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CAPABILITY_RESOLUTION_OLD_KEY=NORMAL_ALTERNATIVE_CANNOT_BYPASS_RANKING");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CAPABILITY_RESOLUTION_AMBIGUOUS=FAIL_CLOSED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CAPABILITY_RESOLUTION_OLD_PAYLOAD=NOT_REUSED");
console.log("OPERATOR_RECOMMENDATION_REFINEMENT_CAPABILITY_RESOLUTION_EXECUTION=NONE");
