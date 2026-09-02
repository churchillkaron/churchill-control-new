import { AvantiqoIntelligenceProviderV2 } from "./AvantiqoIntelligenceProviderV2.js";
import {
  getIntelligenceModalDirectHealth,
  intelligenceModalDirectConfigured,
  AVANTIQO_INTELLIGENCE_MODAL_DIRECT_TRANSPORT,
} from "./AvantiqoIntelligenceModalDirectRuntime.js";
import {
  getAvantiqoIntelligenceEndpointHealth as getRunpodEndpointHealth,
  getAvantiqoIntelligenceEndpointHealthForLane as getRunpodEndpointHealthForLane,
  getAvantiqoIntelligenceRunpodRuntimeConfiguration,
  probeAvantiqoIntelligenceRuntime as probeRunpodIntelligenceRuntime,
} from "./AvantiqoIntelligenceRunpodProvider.js";

const DEFAULT_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const CAPABILITY_DEFAULT_LANES = Object.freeze({
  "ai.reasoning.execute": "deep",
  "ai.text.generate": "fast",
});

function text(value) { return String(value ?? "").trim(); }

export async function getAvantiqoIntelligenceEndpointHealthForLane(options = {}) {
  if (intelligenceModalDirectConfigured()) return getIntelligenceModalDirectHealth();
  return getRunpodEndpointHealthForLane(options);
}

export async function getAvantiqoIntelligenceEndpointHealth() {
  if (intelligenceModalDirectConfigured()) return getIntelligenceModalDirectHealth();
  return getRunpodEndpointHealth();
}

export function getAvantiqoIntelligenceRuntimeConfiguration() {
  const modalConfigured = intelligenceModalDirectConfigured();
  const runpod = getAvantiqoIntelligenceRunpodRuntimeConfiguration();
  if (!modalConfigured) return runpod;
  return {
    provider: "avantiqo-intelligence",
    engine_contract: "AVANTIQO_SYNTHETIC_INTELLIGENCE_ENGINE_V2",
    product_model: "avantiqo-intelligence-v2",
    model: text(process.env.AVANTIQO_INTELLIGENCE_MODEL) || DEFAULT_MODEL,
    fast_model: text(process.env.AVANTIQO_INTELLIGENCE_FAST_MODEL) || FAST_MODEL,
    infrastructure_provider: "MODAL_H100_ASYNC_V1",
    infrastructure_fallback: "RUNPOD_SERVERLESS",
    modal_primary_when_configured: true,
    simultaneous_modal_runpod_execution_forbidden: true,
    engine_enabled: text(process.env.AVANTIQO_INTELLIGENCE_ENGINE_ENABLED).toLowerCase() !== "false",
    runtime_ready: true,
    async_gateway: false,
    modal_gateway_required: false,
    modal_transport: AVANTIQO_INTELLIGENCE_MODAL_DIRECT_TRANSPORT,
    modal_app: "avantiqo-intelligence-owned",
    scale_to_zero: true,
    gpu: "H100",
    max_gpu_containers_per_lane: 1,
    persistent_model_volume: false,
    model_storage: "IMMUTABLE_MODAL_IMAGE_LAYERS",
    safe_lease_required_for_inference: false,
    safe_lease_contract: null,
    execution_lane_policy: "EXPLICIT_FAST_OR_DEEP_WITH_CAPABILITY_DEFAULT_V1",
    default_execution_lane: "deep",
    capability_default_lanes: CAPABILITY_DEFAULT_LANES,
    execution_lanes: {
      deep: { function_name: "deep", model_name: DEFAULT_MODEL, reasoning_mode: "THINKING_REQUIRED" },
      fast: { function_name: "fast", model_name: FAST_MODEL, reasoning_mode: "NON_THINKING_ONLY" },
    },
    raw_reasoning_persisted: false,
  };
}

export async function probeAvantiqoIntelligenceRuntime(options = {}) {
  if (intelligenceModalDirectConfigured()) {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_PROBE_REQUIRES_GOVERNED_ASYNC_SERVICE_RUNTIME");
  }
  return probeRunpodIntelligenceRuntime(options);
}

export const AvantiqoIntelligenceProvider = AvantiqoIntelligenceProviderV2;
