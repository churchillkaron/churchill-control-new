import assert from "node:assert/strict";

import {
  INVESTOR_HUMAN_GENERATION_CONTRACT,
  INVESTOR_HUMAN_POLICY_CONTRACT,
  INVESTOR_HUMAN_RELEASE_CONTRACT,
  assertInvestorHumanGenerationPolicy,
  investorHumanGenerationPolicy,
  investorHumanSceneRequiresControl,
  investorVideoTaskRequiresHumanControl,
} from "../lib/creative/video/runtime/CreativeInvestorHumanGenerationPolicy.js";

const requiredScenes = [9, 11, 12, 13, 14, 15, 16, 17, 19];
for (const scene of requiredScenes) {
  assert.equal(investorHumanSceneRequiresControl(scene), true, `scene ${scene} must be human controlled`);
  const policy = investorHumanGenerationPolicy(scene);
  assert.equal(policy.contract, INVESTOR_HUMAN_POLICY_CONTRACT);
  assert.equal(policy.human_mode_required, true);
  assert.equal(policy.conditioning_mode, "approved_same_identity_multi_keyframe");
  assert.equal(policy.generation_contract, INVESTOR_HUMAN_GENERATION_CONTRACT);
  assert.equal(policy.release_gate_contract, INVESTOR_HUMAN_RELEASE_CONTRACT);
  assert.equal(policy.minimum_keyframes, 3);
  assert.equal(policy.maximum_keyframes, 8);
  assert.equal(policy.generic_video_dispatch_allowed, false);
  assert.equal(policy.exact_master_digest_binding_required, true);
  assert.equal(policy.automated_qc_required, true);
  assert.equal(policy.visual_review_required, true);
  assert.equal(assertInvestorHumanGenerationPolicy(policy), true);
}

const creativeStudioPolicy = investorHumanGenerationPolicy(18);
assert.equal(creativeStudioPolicy.human_mode_required, false);
assert.equal(creativeStudioPolicy.generic_video_dispatch_allowed, true);

assert.equal(
  investorVideoTaskRequiresHumanControl({
    scene: 18,
    task: { input: { instruction: "camera glides over a generated poster and abstract motion graphics" } },
  }),
  false,
);
assert.equal(
  investorVideoTaskRequiresHumanControl({
    scene: 18,
    task: { input: { instruction: "a real chef finishes a plate while a server crosses frame" } },
  }),
  true,
);
assert.equal(
  investorVideoTaskRequiresHumanControl({
    scene: 9,
    task: { input: { instruction: "abstract relationship traces only" } },
  }),
  true,
);

assert.throws(
  () => assertInvestorHumanGenerationPolicy({
    ...investorHumanGenerationPolicy(9),
    generic_video_dispatch_allowed: true,
  }),
  /AVANTIQO_INVESTOR_HUMAN_GENERIC_VIDEO_FORBIDDEN/,
);

console.log("AVANTIQO_INVESTOR_HUMAN_GENERATION_POLICY_TEST=PASS");
console.log(`HUMAN_REQUIRED_SCENES=${requiredScenes.join(",")}`);
console.log("GENERIC_VIDEO_FOR_HUMANS=FORBIDDEN");
