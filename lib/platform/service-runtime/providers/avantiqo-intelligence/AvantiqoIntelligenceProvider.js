import {
  AvantiqoIntelligenceProvider as AvantiqoIntelligenceDeepProvider,
  getAvantiqoIntelligenceEndpointHealth,
  getAvantiqoIntelligenceRuntimeConfiguration as getDeepRuntimeConfiguration,
  probeAvantiqoIntelligenceRuntime,
} from "./AvantiqoIntelligenceDeepProvider.js";
import {
  AvantiqoIntelligenceFastProvider,
  getAvantiqoIntelligenceFastEndpointHealth,
  getAvantiqoIntelligenceFastRuntimeConfiguration,
} from "./AvantiqoIntelligenceFastProvider.js";
import {
  requireAvantiqoIntelligenceSafeLease,
} from "./AvantiqoIntelligenceSafeLeaseGuard.js";

const LANES = new Set(["deep", "fast"]);

function text(value) {
  return String(value ?? "").trim();
}

function executionLane(input = {}) {
  const requested = text(input.execution_lane || input.executionLane).toLowerCase() || "deep";
  if (!LANES.has(requested)) {
    throw new Error(`AVANTIQO_INTELLIGENCE_EXECUTION_LANE_INVALID:${requested}`);
  }
  return requested;
}

export async function getAvantiqoIntelligenceEndpointHealthForLane({
  execution_lane = "deep",
} = {}) {
  const lane = executionLane({ execution_lane });
  return lane === "fast"
    ? getAvantiqoIntelligenceFastEndpointHealth()
    : getAvantiqoIntelligenceEndpointHealth();
}

export function getAvantiqoIntelligenceRuntimeConfiguration() {
  const deep = getDeepRuntimeConfiguration();
  const fast = getAvantiqoIntelligenceFastRuntimeConfiguration();
  return {
    ...deep,
    engine_contract: "AVANTIQO_SYNTHETIC_INTELLIGENCE_ENGINE_V2",
    execution_lane_policy: "EXPLICIT_FAST_OR_DEEP_FAIL_CLOSED_V1",
    safe_lease_required_for_inference: true,
    safe_lease_contract: "AVANTIQO_RUNPOD_SAFE_LEASE_V2",
    default_execution_lane: "deep",
    execution_lanes: {
      deep,
      fast,
    },
    fast_lane_ready: fast.runtime_ready === true,
    raw_reasoning_persisted: false,
  };
}

export const AvantiqoIntelligenceProvider = {
  id: "avantiqo-intelligence",

  async execute(input = {}) {
    const lane = executionLane(input);
    const sourceContext =
      input?.context && typeof input.context === "object" ? input.context : {};
    const lease = requireAvantiqoIntelligenceSafeLease(lane, sourceContext);
    const governedInput = {
      ...input,
      context: {
        ...sourceContext,
        intelligence_safe_lease_guard_contract: lease.contract,
        intelligence_safe_lease_contract: lease.safe_lease_contract,
        intelligence_safe_lease_safe_contract: lease.safe_lease_contract,
        intelligence_safe_lease_lane: lease.lease_lane,
        intelligence_safe_lease_endpoint_id: lease.endpoint_id,
        intelligence_safe_lease_expires_at: lease.expires_at,
        intelligence_safe_lease_source: lease.source,
      },
    };
    if (lane === "fast") {
      return AvantiqoIntelligenceFastProvider.execute(governedInput);
    }
    return AvantiqoIntelligenceDeepProvider.execute(governedInput);
  },

  probe: probeAvantiqoIntelligenceRuntime,
};

export {
  getAvantiqoIntelligenceEndpointHealth,
  probeAvantiqoIntelligenceRuntime,
};
