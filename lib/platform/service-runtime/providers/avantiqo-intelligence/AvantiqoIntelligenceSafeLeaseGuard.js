export const AVANTIQO_INTELLIGENCE_SAFE_LEASE_GUARD_CONTRACT =
  "AVANTIQO_INTELLIGENCE_SAFE_LEASE_GUARD_V2";

const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const LANE_POLICY = Object.freeze({
  deep: new Set(["intelligence-deep"]),
  fast: new Set(["intelligence-fast"]),
});

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function validateEndpointId(value) {
  const endpointId = text(value, 200);
  if (!/^[A-Za-z0-9_-]+$/.test(endpointId)) {
    throw new Error("AVANTIQO_INTELLIGENCE_SAFE_LEASE_ENDPOINT_INVALID");
  }
  return endpointId;
}

function requestScopedLease(context = {}) {
  const source = object(context);
  const endpointId = text(source.intelligence_safe_lease_endpoint_id, 200);
  if (!endpointId) return null;
  return {
    safeLeaseContract: text(
      source.intelligence_safe_lease_safe_contract ||
        source.intelligence_safe_lease_contract,
      120,
    ),
    leaseLane: text(source.intelligence_safe_lease_lane, 120),
    endpointId,
    expiresAt: text(source.intelligence_safe_lease_expires_at, 160),
  };
}

function environmentLease() {
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE, 40).toUpperCase() !== "YES") {
    throw new Error("AVANTIQO_INTELLIGENCE_SAFE_LEASE_ACTIVE_REQUIRED");
  }
  return {
    safeLeaseContract: text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT, 120),
    leaseLane: text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE, 120),
    endpointId: text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID, 200),
    expiresAt: text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT, 160),
  };
}

export function requireAvantiqoIntelligenceSafeLease(executionLane, context = null) {
  const lane = text(executionLane, 40).toLowerCase();
  const allowedLeaseLanes = LANE_POLICY[lane];
  if (!allowedLeaseLanes) {
    throw new Error(`AVANTIQO_INTELLIGENCE_SAFE_LEASE_EXECUTION_LANE_INVALID:${lane || "NONE"}`);
  }

  const scoped = requestScopedLease(context);
  const lease = scoped || environmentLease();

  if (lease.safeLeaseContract !== SAFE_LEASE_CONTRACT) {
    throw new Error("AVANTIQO_INTELLIGENCE_SAFE_LEASE_V2_REQUIRED");
  }
  if (!allowedLeaseLanes.has(lease.leaseLane)) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_SAFE_LEASE_LANE_MISMATCH:execution=${lane}:lease=${lease.leaseLane || "NONE"}`,
    );
  }

  const endpointId = validateEndpointId(lease.endpointId);
  const expiresAt = Date.parse(lease.expiresAt);
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
    lease_lane: lease.leaseLane,
    endpoint_id: endpointId,
    expires_at: new Date(expiresAt).toISOString(),
    source: scoped ? "REQUEST_SCOPED" : "PROCESS_ENVIRONMENT",
  };
}

export default requireAvantiqoIntelligenceSafeLease;
