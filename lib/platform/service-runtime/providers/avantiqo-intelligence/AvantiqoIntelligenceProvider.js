import { AvantiqoIntelligenceProviderV2 } from "./AvantiqoIntelligenceProviderV2.js";
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
function modalOverflowConfigured() {
  return false;
}

function engineEnabled() {
  const setting = text(process.env.AVANTIQO_INTELLIGENCE_ENGINE_ENABLED);
  return setting ? !disabled(setting) : true;
}


export async function getAvantiqoIntelligenceEndpointHealthForLane(input = {}) {
  const lane = text(input.execution_lane || input.executionLane).toLowerCase() || "fast";
  if (shouldUseLocalIntelligenceQueue({ ...input, execution_lane: lane })) {
    return getIntelligenceLocalQueueHealth();
  }
  if (["front", "fast"].includes(lane) && shouldUseLocalIntelligence({ ...input, execution_lane: lane })) {
    return getIntelligenceLocalHealth();
  }
  throw new Error("AVANTIQO_INTELLIGENCE_LOCAL_RUNTIME_REQUIRED");
}

export async function getAvantiqoIntelligenceEndpointHealth() {
  if (intelligenceLocalQueueConfigured()) return getIntelligenceLocalQueueHealth();
  if (intelligenceLocalConfigured()) return getIntelligenceLocalHealth();
  throw new Error("AVANTIQO_INTELLIGENCE_LOCAL_RUNTIME_REQUIRED");
}

export function getAvantiqoIntelligenceRuntimeConfiguration() {
  const localQueueConfigured = intelligenceLocalQueueConfigured();
  const localConfigured = localQueueConfigured || intelligenceLocalConfigured();
  const localInfrastructure = localQueueConfigured ? AVANTIQO_INTELLIGENCE_LOCAL_QUEUE_INFRASTRUCTURE : AVANTIQO_INTELLIGENCE_LOCAL_INFRASTRUCTURE;
  const localTransport = localQueueConfigured ? AVANTIQO_INTELLIGENCE_LOCAL_QUEUE_TRANSPORT : AVANTIQO_INTELLIGENCE_LOCAL_TRANSPORT;
  const enabled = engineEnabled();
  const overflowConfigured = modalOverflowConfigured();
  return {
    provider: "avantiqo-intelligence",
    engine_contract: "AVANTIQO_SYNTHETIC_INTELLIGENCE_ENGINE_V2",
    product_model: "avantiqo-intelligence-v2",
    model: text(process.env.AVANTIQO_INTELLIGENCE_MODEL) || DEFAULT_MODEL,
    front_model: FRONT_MODEL,
    fast_model: text(process.env.AVANTIQO_INTELLIGENCE_FAST_MODEL) || FAST_MODEL,
    infrastructure_provider: localConfigured ? localInfrastructure : null,
    infrastructure_fallback: null,
    governed_overflow_infrastructure: "MODAL_H100_ASYNC_V1",
    governed_modal_overflow_supported: true,
    governed_modal_overflow_available: overflowConfigured,
    automatic_modal_fallback_allowed: false,
    modal_overflow_owner_approval_required: true,
    modal_overflow_local_insufficiency_proof_required: true,
    modal_overflow_spend_ceiling_required: true,
    local_compute_configured: localConfigured,
    local_compute_primary: localConfigured,
    local_compute_transport: localConfigured ? localTransport : null,
    engine_enabled: enabled,
    runtime_ready: enabled && localConfigured,
    runtime_credentials_required_at_execution: false,
    modal_overflow_server_credentials_required_at_submission: true,
    provider_executor_credential_injection: false,
    async_gateway: false,
    scale_to_zero: true,
    front_scale_to_zero: false,
    front_min_containers: 1,
    fast_bounded_warm_idle_seconds: 120,
    deep_scale_to_zero: true,
    deep_bounded_warm_idle_seconds: 5,
    gpu: null,
    max_gpu_containers_per_lane: 1,
    persistent_model_volume: false,
    safe_lease_required_for_inference: false,
    safe_lease_contract: null,
    execution_lane_policy: "EXPLICIT_FRONT_FAST_OR_DEEP_WITH_CAPABILITY_DEFAULT_V2",
    default_execution_lane: "deep",
    capability_default_lanes: CAPABILITY_DEFAULT_LANES,
    execution_lanes: {
      front: { class_name: "FrontConversation", app_name: null, model_name: FRONT_MODEL, reasoning_mode: "NON_THINKING_ONLY", tools_allowed: false, mutation_authority: false, memory_snapshot: false, infrastructure_provider: localInfrastructure, min_containers: 0, max_containers: 1, scaledown_window_seconds: null, runtime_contract: "AVANTIQO_INTELLIGENCE_FRONT_LOCAL_V1" },
      deep: { function_name: "deep", model_name: DEFAULT_MODEL, reasoning_mode: "THINKING_REQUIRED", min_containers: 0, max_containers: 1, scaledown_window_seconds: 5, runtime_contract: "AVANTIQO_INTELLIGENCE_DEEP_SCALE_ZERO_V3" },
      fast: { function_name: "fast", model_name: FAST_MODEL, reasoning_mode: "NON_THINKING_ONLY", gpu_memory_snapshot: false, min_containers: 0, max_containers: 1, scaledown_window_seconds: 5, runtime_contract: "AVANTIQO_INTELLIGENCE_FAST_SCALE_ZERO_V2" },
    },
    raw_reasoning_persisted: false,
  };
}

export async function probeAvantiqoIntelligenceRuntime(input = {}) {
  return getAvantiqoIntelligenceEndpointHealth(input);
}

export const AvantiqoIntelligenceProvider = AvantiqoIntelligenceProviderV2;
