export const AVANTIQO_MODEL_IMPROVEMENT_SAFE_LEASE_GUARD_CONTRACT =
  "AVANTIQO_MODEL_IMPROVEMENT_SAFE_LEASE_GUARD_V1";

const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";

const STAGE_POLICY = Object.freeze({
  trainer: "intelligence-trainer",
  benchmark: "intelligence-benchmark",
  candidate: "intelligence-candidate",
});

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function endpointId(value) {
  const id = text(value, 200);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error("AVANTIQO_MODEL_IMPROVEMENT_SAFE_LEASE_ENDPOINT_INVALID");
  }
  return id;
}

export function requireAvantiqoModelImprovementSafeLease(stage, {
  configuredEndpointId = null,
} = {}) {
  const normalizedStage = text(stage, 40).toLowerCase();
  const expectedLane = STAGE_POLICY[normalizedStage];
  if (!expectedLane) {
    throw new Error(
      `AVANTIQO_MODEL_IMPROVEMENT_SAFE_LEASE_STAGE_INVALID:${normalizedStage || "NONE"}`,
    );
  }

  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE, 40).toUpperCase() !== "YES") {
    throw new Error("AVANTIQO_MODEL_IMPROVEMENT_SAFE_LEASE_ACTIVE_REQUIRED");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT, 120) !== SAFE_LEASE_CONTRACT) {
    throw new Error("AVANTIQO_MODEL_IMPROVEMENT_SAFE_LEASE_V2_REQUIRED");
  }

  const leaseLane = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE, 120);
  if (leaseLane !== expectedLane) {
    throw new Error(
      `AVANTIQO_MODEL_IMPROVEMENT_SAFE_LEASE_LANE_MISMATCH:stage=${normalizedStage}:lease=${leaseLane || "NONE"}:expected=${expectedLane}`,
    );
  }

  const leasedEndpointId = endpointId(
    process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID,
  );
  const configured = text(configuredEndpointId, 200);
  if (configured && endpointId(configured) !== leasedEndpointId) {
    throw new Error(
      `AVANTIQO_MODEL_IMPROVEMENT_SAFE_LEASE_ENDPOINT_MISMATCH:configured=${configured}:leased=${leasedEndpointId}`,
    );
  }

  const expiresAt = Date.parse(
    text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT, 160),
  );
  if (!Number.isFinite(expiresAt)) {
    throw new Error("AVANTIQO_MODEL_IMPROVEMENT_SAFE_LEASE_EXPIRY_REQUIRED");
  }
  if (Date.now() >= expiresAt) {
    throw new Error("AVANTIQO_MODEL_IMPROVEMENT_SAFE_LEASE_EXPIRED");
  }

  return {
    contract: AVANTIQO_MODEL_IMPROVEMENT_SAFE_LEASE_GUARD_CONTRACT,
    safe_lease_contract: SAFE_LEASE_CONTRACT,
    stage: normalizedStage,
    lease_lane: leaseLane,
    endpoint_id: leasedEndpointId,
    expires_at: new Date(expiresAt).toISOString(),
    direct_runpod_submission_allowed: true,
    direct_endpoint_scaling_allowed: false,
    production_model_promotion_effect: "NONE",
  };
}

export const AvantiqoModelImprovementSafeLeaseGuard = Object.freeze({
  contract: AVANTIQO_MODEL_IMPROVEMENT_SAFE_LEASE_GUARD_CONTRACT,
  require: requireAvantiqoModelImprovementSafeLease,
  lanes: STAGE_POLICY,
});

export default requireAvantiqoModelImprovementSafeLease;
