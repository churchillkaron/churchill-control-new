export const AVANTIQO_MODEL_IMPROVEMENT_SAFE_LEASE_GUARD_CONTRACT =
  "AVANTIQO_MODEL_IMPROVEMENT_LOCAL_RESOURCE_GUARD_V2";

const STAGE_POLICY = Object.freeze({
  trainer: "intelligence-trainer",
  benchmark: "intelligence-benchmark",
  candidate: "intelligence-candidate",
});

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value, 20).toLowerCase());
}

export function requireAvantiqoModelImprovementSafeLease(stage) {
  const normalizedStage = text(stage, 40).toLowerCase();
  const expectedLane = STAGE_POLICY[normalizedStage];
  if (!expectedLane) {
    throw new Error(
      `AVANTIQO_MODEL_IMPROVEMENT_LOCAL_STAGE_INVALID:${normalizedStage || "NONE"}`,
    );
  }

  if (!enabled(process.env.AVANTIQO_INTELLIGENCE_LOCAL_MODEL_IMPROVEMENT_ENABLED)) {
    throw new Error("AVANTIQO_MODEL_IMPROVEMENT_LOCAL_RUNTIME_REQUIRED");
  }

  return {
    contract: AVANTIQO_MODEL_IMPROVEMENT_SAFE_LEASE_GUARD_CONTRACT,
    stage: normalizedStage,
    lease_lane: expectedLane,
    endpoint_id: null,
    external_compute_allowed: false,
    external_provider_submission_allowed: false,
    direct_endpoint_scaling_allowed: false,
    local_owned_hardware_required: true,
    production_model_promotion_effect: "NONE",
  };
}

export const AvantiqoModelImprovementSafeLeaseGuard = Object.freeze({
  contract: AVANTIQO_MODEL_IMPROVEMENT_SAFE_LEASE_GUARD_CONTRACT,
  require: requireAvantiqoModelImprovementSafeLease,
  lanes: STAGE_POLICY,
});

export default requireAvantiqoModelImprovementSafeLease;
