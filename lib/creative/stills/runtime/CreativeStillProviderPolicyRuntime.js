const CONTRACT = "CREATIVE_STILL_PROVIDER_POLICY_V1";

function text(value) {
  return String(value ?? "").trim().toLowerCase();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function imageCapability(task = {}) {
  const capability = text(task.capability || task.service_code || task.service_id);
  return capability.startsWith("ai.image.") ? capability : null;
}

export function buildCreativeStillProviderPolicy(task = {}) {
  const capability = imageCapability(task);
  if (!capability) return Object.freeze({});

  const requirements = object(task.input?.requirements || task.metadata?.requirements);
  const expected = object(requirements.expected_contract);
  const repair = ["ai.image.edit", "ai.image.inpaint", "ai.image.outpaint", "ai.image.upscale"].includes(capability);
  const fidelityCritical = expected.identity_expected === true || expected.product_expected === true;
  const worldClass = task.input?.world_class_quality_required === true || task.metadata?.world_class_quality_required === true;
  const finalCandidate = task.metadata?.release_candidate === true || task.input?.release_candidate === true;

  const strict = repair || fidelityCritical || worldClass || finalCandidate;
  const weights = strict
    ? { quality: 5, reliability: 3, cost: 1.5, speed: 0.5, preference: 1 }
    : { quality: 2.5, reliability: 1.5, cost: 3.5, speed: 2.5, preference: 1 };

  return Object.freeze({
    contract: CONTRACT,
    minimum_quality_score: strict ? 90 : 86,
    minimum_reliability_score: strict ? 92 : 88,
    selection_weights: weights,
    execution_mode: strict ? "QUALITY_QUALIFIED" : "FAST_COST_QUALIFIED",
  });
}

export const CreativeStillProviderPolicyRuntime = Object.freeze({
  contract: CONTRACT,
  build: buildCreativeStillProviderPolicy,
});

export default CreativeStillProviderPolicyRuntime;
