import { AvantiqoIntelligenceProviderV2 } from "./AvantiqoIntelligenceProviderV2.js";
import {
  getIntelligenceModalDirectHealth,
  intelligenceModalDirectConfigured,
  AVANTIQO_INTELLIGENCE_MODAL_DIRECT_TRANSPORT,
} from "./AvantiqoIntelligenceModalDirectRuntime.js";
import {
  getIntelligenceLocalHealth,
  intelligenceLocalConfigured,
  shouldUseLocalIntelligence,
  AVANTIQO_INTELLIGENCE_LOCAL_INFRASTRUCTURE,
  AVANTIQO_INTELLIGENCE_LOCAL_TRANSPORT,
} from "./AvantiqoIntelligenceLocalRuntime.js";
import {
  getIntelligenceLocalQueueHealth,
  intelligenceLocalQueueConfigured,
  shouldUseLocalIntelligenceQueue,
  AVANTIQO_INTELLIGENCE_LOCAL_QUEUE_INFRASTRUCTURE,
  AVANTIQO_INTELLIGENCE_LOCAL_QUEUE_TRANSPORT,
} from "./AvantiqoIntelligenceLocalQueueRuntime.js";

const DEFAULT_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const FRONT_MODEL = "Qwen/Qwen3-4B-GGUF:Q4_K_M";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const CAPABILITY_DEFAULT_LANES = Object.freeze({
  "ai.reasoning.execute": "deep",
  "ai.text.generate": "fast",
});

function text(value) { return String(value ?? "").trim(); }
function disabled(value) { return ["0", "false", "no", "off"].includes(text(value).toLowerCase()); }

function engineEnabled() {
  const setting = text(process.env.AVANTIQO_INTELLIGENCE_ENGINE_ENABLED);
  return setting ? !disabled(setting) : true;
}

function requireModalDirectConfigured(input = {}) {
  if (!intelligenceModalDirectConfigured(input)) {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_DIRECT_CONFIGURATION_REQUIRED");
  }
}

export async function getAvantiqoIntelligenceEndpointHealthForLane(input = {}) {
  const lane = text(input.execution_lane || input.executionLane).toLowerCase() || "fast";
  if (["front", "fast"].includes(lane) && shouldUseLocalIntelligenceQueue({ ...input, execution_lane: lane })) {
    return getIntelligenceLocalQueueHealth();
  }
  if (["front", "fast"].includes(lane) && shouldUseLocalIntelligence({ ...input, execution_lane: lane })) {
    return getIntelligenceLocalHealth();
  }
  requireModalDirectConfigured(input);
  return getIntelligenceModalDirectHealth(input);
}

export async function getAvantiqoIntelligenceEndpointHealth(input = {}) {
  if (intelligenceLocalQueueConfigured()) return getIntelligenceLocalQueueHealth();
  if (intelligenceLocalConfigured()) return getIntelligenceLocalHealth();
  requireModalDirectConfigured(input);
  return getIntelligenceModalDirectHealth(input);
}

export function getAvantiqoIntelligenceRuntimeConfiguration() {
  const processEnvConfigured = intelligenceModalDirectConfigured();
  const localQueueConfigured = intelligenceLocalQueueConfigured();
  const localConfigured = localQueueConfigured || intelligenceLocalConfigured();
  const localInfrastructure = localQueueConfigured ? AVANTIQO_INTELLIGENCE_LOCAL_QUEUE_INFRASTRUCTURE : AVANTIQO_INTELLIGENCE_LOCAL_INFRASTRUCTURE;
  const localTransport = localQueueConfigured ? AVANTIQO_INTELLIGENCE_LOCAL_QUEUE_TRANSPORT : AVANTIQO_INTELLIGENCE_LOCAL_TRANSPORT;
  const enabled = engineEnabled();
  return {
    provider: "avantiqo-intelligence",
    engine_contract: "AVANTIQO_SYNTHETIC_INTELLIGENCE_ENGINE_V2",
    product_model: "avantiqo-intelligence-v2",
    model: text(process.env.AVANTIQO_INTELLIGENCE_MODEL) || DEFAULT_MODEL,
    front_model: FRONT_MODEL,
    fast_model: text(process.env.AVANTIQO_INTELLIGENCE_FAST_MODEL) || FAST_MODEL,
    infrastructure_provider: localConfigured ? localInfrastructure : "MODAL_H100_ASYNC_V1",
    infrastructure_fallback: "MODAL_H100_ASYNC_V1",
    local_compute_configured: localConfigured,
    local_compute_primary: localConfigured,
    local_compute_transport: localConfigured ? localTransport : null,
    modal_only: false,
    modal_primary_when_configured: !localConfigured,
    simultaneous_modal_runpod_execution_forbidden: true,
    engine_enabled: enabled,
    runtime_ready: enabled,
    runtime_credentials_required_at_execution: true,
    provider_executor_credential_injection: true,
    modal_process_env_configured: processEnvConfigured,
    async_gateway: false,
    modal_gateway_required: false,
    modal_transport: AVANTIQO_INTELLIGENCE_MODAL_DIRECT_TRANSPORT,
    modal_app: "avantiqo-intelligence-owned",
    scale_to_zero: true,
    front_scale_to_zero: true,
    front_min_containers: 0,
    fast_bounded_warm_idle_seconds: 120,
    deep_scale_to_zero: true,
    deep_bounded_warm_idle_seconds: 60,
    gpu: "H100",
    max_gpu_containers_per_lane: 1,
    persistent_model_volume: false,
    model_storage: "IMMUTABLE_MODAL_IMAGE_LAYERS",
    safe_lease_required_for_inference: false,
    safe_lease_contract: null,
    execution_lane_policy: "EXPLICIT_FRONT_FAST_OR_DEEP_WITH_CAPABILITY_DEFAULT_V2",
    default_execution_lane: "deep",
    capability_default_lanes: CAPABILITY_DEFAULT_LANES,
    execution_lanes: {
      front: { class_name: "FrontConversation", app_name: localConfigured ? null : "avantiqo-intelligence-front-owned", model_name: FRONT_MODEL, reasoning_mode: "NON_THINKING_ONLY", tools_allowed: false, mutation_authority: false, memory_snapshot: false, infrastructure_provider: localConfigured ? localInfrastructure : "MODAL_CPU_SNAPSHOT_V1", min_containers: 0, max_containers: localConfigured ? 1 : 2, scaledown_window_seconds: localConfigured ? null : 30, runtime_contract: "AVANTIQO_INTELLIGENCE_FRONT_SCALE_ZERO_V3" },
      deep: { function_name: "deep", model_name: DEFAULT_MODEL, reasoning_mode: "THINKING_REQUIRED", min_containers: 0, max_containers: 1, scaledown_window_seconds: 60, runtime_contract: "AVANTIQO_INTELLIGENCE_DEEP_BOUNDED_WARM_V2" },
      fast: { function_name: "fast", model_name: FAST_MODEL, reasoning_mode: "NON_THINKING_ONLY", gpu_memory_snapshot: false, min_containers: 0, max_containers: 1, scaledown_window_seconds: 120, runtime_contract: "AVANTIQO_INTELLIGENCE_FAST_WARM_FUNCTION_V1" },
    },
    raw_reasoning_persisted: false,
  };
}

export async function probeAvantiqoIntelligenceRuntime(input = {}) {
  requireModalDirectConfigured(input);
  throw new Error("AVANTIQO_INTELLIGENCE_MODAL_PROBE_REQUIRES_GOVERNED_ASYNC_SERVICE_RUNTIME");
}

export const AvantiqoIntelligenceProvider = AvantiqoIntelligenceProviderV2;
