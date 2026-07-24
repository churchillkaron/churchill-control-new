import {
  normalizeCreativeStoryboardPlan as normalizeV2,
  inspectCreativeStoryboardPlan as inspectV2,
  enforceCreativeStoryboardPlan as enforceV2,
} from "./CreativeStoryboardPlanContractV2";

import {
  convergeCreativeFailurePrevention,
} from "./CreativeFailurePreventionConvergence";

function convergedInput(input = {}) {
  return {
    ...input,
    creativePlan: convergeCreativeFailurePrevention({
      creativePlan: input.creativePlan || {},
    }),
  };
}

export function normalizeCreativeStoryboardPlan(plan = {}) {
  return normalizeV2(
    convergeCreativeFailurePrevention({
      creativePlan: plan,
    }),
  );
}

export function inspectCreativeStoryboardPlan(input = {}) {
  return inspectV2(convergedInput(input));
}

export function enforceCreativeStoryboardPlan(input = {}) {
  return enforceV2(convergedInput(input));
}
