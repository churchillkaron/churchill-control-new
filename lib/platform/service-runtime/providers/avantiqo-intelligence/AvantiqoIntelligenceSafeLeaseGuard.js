export const AVANTIQO_INTELLIGENCE_SAFE_LEASE_GUARD_CONTRACT =
  "AVANTIQO_INTELLIGENCE_SAFE_LEASE_GUARD_V1";

const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const LANE_POLICY = Object.freeze({
  deep: new Set(["intelligence-deep"]),
  fast: new Set(["intelligence-fast", "intelligence-fast-candidate"]),
});

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function validateEndpointId(value) {
  const endpointId = text(value, 200);
  if (!/^[A-Za-z0-9_-]+$/.test(endpointId)) {
    throw new Error("AVANTIQO_INTELLIGENCE_SAFE_LEASE_ENDPOINT_INVALID");
  }
  return endpointId;
}

export function requireAvantiqoIntelligenceSafeLease(executionLane) {
  const lane = text(executionLane, 40).toLowerCase();
  const allowedLeaseLanes = LANE_POLICY[lane];
  if (!allowedLeaseLanes) {
    throw new Error(`AVANTIQO_INTELLIGENCE_SAFE_LEASE_EXECUTION_LANE_INVALID:${lane || "NONE"}`);
  }

  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE, 40).toUpperCase() !== "YES") {
    throw new Error("AVANTIQO_INTELLIGENCE_SAFE_LEASE_ACTIVE_REQUIRED");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT, 120) !== SAFE_LEASE_CONTRACT) {
    throw new Error("AVANTIQO_INTELLIGENCE_SAFE_LEASE_V2_REQUIRED");
  }

  const leaseLane = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE, 120);
  if (!allowedLeaseLanes.has(leaseLane)) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_SAFE_LEASE_LANE_MISMATCH:execution=${lane}:lease=${leaseLane || "NONE"}`,
    );
  }

  const endpointId = validateEndpointId(
    process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID,
  );
  const expiresAt = Date.parse(text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT, 160));
  if (!Number.isFinite(expiresAt)) {
    throw new Error("AVANTIQO_INTELLIGENCE_SAFE_LEASE_EXPIRY_REQUIRED");
  }
  if (Date.now() >= expiresAt) {
    throw new Error("AVANTIQO_INTELLIGENCE_SAFE_LEASE_EXPIRED");
  }

  return {
    contract: AVANTIQO_INTELLIGENCE_SAFE_LEASE_GUARD_CONTRACT,
    safe_lease_contract: SAFE_LEASE_CONTRACT,
    execution_lane: lane,
    lease_lane: leaseLane,
    endpoint_id: endpointId,
    expires_at: new Date(expiresAt).toISOString(),
  };
}

export default requireAvantiqoIntelligenceSafeLease;
