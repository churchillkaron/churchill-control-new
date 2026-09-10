import test from "node:test";
import assert from "node:assert/strict";
import { CreativeProductCapabilityDemonstrationRuntime } from "../lib/creative/quality/runtime/CreativeProductCapabilityDemonstrationRuntime.js";

test("embodied capability proof passes when intent action response and advantage are visible", () => {
  const result = CreativeProductCapabilityDemonstrationRuntime.evaluate({
    product_capability_demonstration: {
      mode: "EMBODIED_USE",
      capability: "hands-free capture while the athlete remains in motion",
      human_intent: "the athlete needs to preserve the decisive moment without stopping the action or reaching for another device",
      physical_action: "the athlete continues the movement while invoking capture through the worn product",
      visible_response: "the recorded point of view appears as a direct consequence of the uninterrupted movement",
      felt_advantage: "the audience understands that performance and capture happen simultaneously instead of competing for attention",
      proof_frame: "one continuous action establishes the athlete, the worn product and the captured point of view without explanatory copy",
      evidence_refs: [],
      failure_substitutes: ["static product beauty shot", "feature label without use"],
    },
  });
  assert.equal(result.passed, true);
});

test("decorative hero product without causal proof fails", () => {
  const result = CreativeProductCapabilityDemonstrationRuntime.evaluate({
    product_capability_demonstration: {
      mode: "EMBODIED_USE",
      capability: "performance",
      human_intent: "looks cool",
      physical_action: "product spins",
      visible_response: "beautiful",
      felt_advantage: "premium",
      proof_frame: "hero shot",
      failure_substitutes: [],
    },
  });
  assert.equal(result.passed, false);
  assert.ok(result.failures.includes("SHOT_PRODUCT_HUMAN_INTENT_REQUIRED"));
  assert.ok(result.failures.includes("SHOT_PRODUCT_DEMO_FAILURE_SUBSTITUTES_REQUIRED"));
});
