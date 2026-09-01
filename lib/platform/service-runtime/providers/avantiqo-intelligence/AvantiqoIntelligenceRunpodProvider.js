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
import { requireAvantiqoIntelligenceSafeLease } from "./AvantiqoIntelligenceSafeLeaseGuard.js";

const LANES = new Set(["deep", "fast"]);
const CAPABILITY_DEFAULT_LANE = Object.freeze({
  "ai.reasoning.execute": "deep",
  "ai.text.generate": "fast",
});
function text(value) { return String(value ?? "").trim(); }
function executionLane(input = {}) {
  const explicit = text(input.execution_lane || input.executionLane).toLowerCase();
  const capabilityLane = CAPABILITY_DEFAULT_LANE[text(input.capability).toLowerCase()];
  const requested = explicit || capabilityLane || "deep";
  if (!LANES.has(requested)) throw new Error(`AVANTIQO_INTELLIGENCE_EXECUTION_LANE_INVALID:${requested}`);
  return requested;
}

export async function getAvantiqoIntelligenceEndpointHealthForLane({ execution_lane = "deep" } = {}) {
  const lane = executionLane({ execution_lane });
  return lane === "fast"
    ? getAvantiqoIntelligenceFastEndpointHealth()
    : getAvantiqoIntelligenceEndpointHealth();
}

export function getAvantiqoIntelligenceRunpodRuntimeConfiguration() {
  const deep = getDeepRuntimeConfiguration();
  const fast = getAvantiqoIntelligenceFastRuntimeConfiguration();
  return {
    ...deep,
    engine_contract: "AVANTIQO_SYNTHETIC_INTELLIGENCE_ENGINE_V2",
    execution_lane_policy: "EXPLICIT_FAST_OR_DEEP_WITH_CAPABILITY_DEFAULT_V1",
    safe_lease_required_for_inference: true,
    safe_lease_contract: "AVANTIQO_RUNPOD_SAFE_LEASE_V2",
    default_execution_lane: "deep",
    capability_default_lanes: CAPABILITY_DEFAULT_LANE,
    execution_lanes: { deep, fast },
    fast_lane_ready: fast.runtime_ready === true,
    infrastructure_provider: "RUNPOD_SERVERLESS",
    raw_reasoning_persisted: false,
  };
}

export const AvantiqoIntelligenceRunpodProvider = {
  id: "avantiqo-intelligence",
  async execute(input = {}) {
    const lane = executionLane(input);
    const sourceContext = input?.context && typeof input.context === "object" ? input.context : {};
    const lease = requireAvantiqoIntelligenceSafeLease(lane, sourceContext);
    const governedInput = {
      ...input,
      execution_lane: lane,
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
    return lane === "fast"
      ? AvantiqoIntelligenceFastProvider.execute(governedInput)
      : AvantiqoIntelligenceDeepProvider.execute(governedInput);
  },
  probe: probeAvantiqoIntelligenceRuntime,
};

export { getAvantiqoIntelligenceEndpointHealth, probeAvantiqoIntelligenceRuntime };
