import { AvantiqoIntelligenceProviderV2 } from "./AvantiqoIntelligenceProviderV2.js";
import {
  getAvantiqoIntelligenceEndpointHealth as getRunpodEndpointHealth,
  getAvantiqoIntelligenceEndpointHealthForLane as getRunpodEndpointHealthForLane,
  getAvantiqoIntelligenceRunpodRuntimeConfiguration,
  probeAvantiqoIntelligenceRuntime as probeRunpodIntelligenceRuntime,
} from "./AvantiqoIntelligenceRunpodProvider.js";

const MODAL_HTTP_CONTRACT = "AVANTIQO_INTELLIGENCE_MODAL_HTTP_V1";
const MODAL_TRANSPORT = "modal-function-call";
const DEFAULT_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const CAPABILITY_DEFAULT_LANES = Object.freeze({
  "ai.reasoning.execute": "deep",
  "ai.text.generate": "fast",
});

function text(value) { return String(value ?? "").trim(); }
function modalConfig() {
  const baseUrl = text(process.env.AVANTIQO_INTELLIGENCE_MODAL_BASE_URL).replace(/\/+$/, "");
  const token = text(process.env.AVANTIQO_INTELLIGENCE_MODAL_GATEWAY_TOKEN);
  if (!baseUrl || token.length < 40) return null;
  return { baseUrl, token };
}
async function modalHealth() {
  const config = modalConfig();
  if (!config) throw new Error("AVANTIQO_INTELLIGENCE_MODAL_CONFIGURATION_REQUIRED");
  const started = Date.now();
  const response = await fetch(`${config.baseUrl}/health`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${config.token}` },
    signal: AbortSignal.timeout(30000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.contract !== MODAL_HTTP_CONTRACT || body?.transport !== MODAL_TRANSPORT) {
    throw new Error(`AVANTIQO_INTELLIGENCE_MODAL_HEALTH_INVALID:${response.status}`);
  }
  if (body.gateway_gpu_imported !== false || body.gpu_inference_performed !== false) {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_HEALTH_GPU_BOUNDARY_INVALID");
  }
  return {
    success: true,
    latency_ms: Date.now() - started,
    infrastructure_provider: "MODAL_H100_ASYNC_V1",
    gateway_gpu_imported: false,
    gpu_inference_performed: false,
    scale_to_zero: body.scale_to_zero === true,
    gpu_functions: body.gpu_functions || [],
  };
}

export async function getAvantiqoIntelligenceEndpointHealthForLane(options = {}) {
  if (modalConfig()) return modalHealth();
  return getRunpodEndpointHealthForLane(options);
}

export async function getAvantiqoIntelligenceEndpointHealth() {
  if (modalConfig()) return modalHealth();
  return getRunpodEndpointHealth();
}

export function getAvantiqoIntelligenceRuntimeConfiguration() {
  const modal = modalConfig();
  const runpod = getAvantiqoIntelligenceRunpodRuntimeConfiguration();
  if (!modal) return runpod;
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
    async_gateway: true,
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
      deep: { model_name: DEFAULT_MODEL, reasoning_mode: "THINKING_REQUIRED" },
      fast: { model_name: FAST_MODEL, reasoning_mode: "NON_THINKING_ONLY" },
    },
    raw_reasoning_persisted: false,
  };
}

export async function probeAvantiqoIntelligenceRuntime(options = {}) {
  if (modalConfig()) {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_PROBE_REQUIRES_GOVERNED_ASYNC_SERVICE_RUNTIME");
  }
  return probeRunpodIntelligenceRuntime(options);
}

export const AvantiqoIntelligenceProvider = AvantiqoIntelligenceProviderV2;
