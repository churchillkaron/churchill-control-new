import { PROVIDER_REGISTRY } from "@/lib/platform/service-runtime/providers/ProviderRegistry";
import { intelligenceLocalConfigured, AVANTIQO_INTELLIGENCE_LOCAL_INFRASTRUCTURE, AVANTIQO_INTELLIGENCE_LOCAL_TRANSPORT } from "./AvantiqoIntelligenceLocalRuntime.js";
import { intelligenceLocalQueueConfigured, AVANTIQO_INTELLIGENCE_LOCAL_QUEUE_INFRASTRUCTURE, AVANTIQO_INTELLIGENCE_LOCAL_QUEUE_TRANSPORT } from "./AvantiqoIntelligenceLocalQueueRuntime.js";
import { intelligenceModalDirectConfigured } from "./AvantiqoIntelligenceModalDirectRuntime.js";
import { intelligenceModalOverflowProposalWorkflowEnabled } from "./AvantiqoIntelligenceModalOverflowPolicy.js";

const PROVIDER_ID = "avantiqo-intelligence";
const DEFAULT_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const FRONT_MODEL = "Qwen/Qwen3-4B-GGUF:Q4_K_M";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";

function text(value) { return String(value ?? "").trim(); }
function score(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : fallback;
}
function disabled(value) { return ["0", "false", "no", "off"].includes(text(value).toLowerCase()); }
function positive(value) { const number = Number(value); return Number.isFinite(number) && number > 0; }

const localQueueConfigured = intelligenceLocalQueueConfigured();
const localComputeConfigured = localQueueConfigured || intelligenceLocalConfigured();
const localInfrastructure = localQueueConfigured ? AVANTIQO_INTELLIGENCE_LOCAL_QUEUE_INFRASTRUCTURE : AVANTIQO_INTELLIGENCE_LOCAL_INFRASTRUCTURE;
const localTransport = localQueueConfigured ? AVANTIQO_INTELLIGENCE_LOCAL_QUEUE_TRANSPORT : AVANTIQO_INTELLIGENCE_LOCAL_TRANSPORT;
const engineSetting = text(process.env.AVANTIQO_INTELLIGENCE_ENGINE_ENABLED);
const engineEnabled = engineSetting ? !disabled(engineSetting) : true;
const localReviewRuntimeAllowed = text(process.env.NODE_ENV).toLowerCase() === "development";
const runtimeAvailable = Boolean((engineEnabled || localReviewRuntimeAllowed) && localComputeConfigured);
const configuredModel = text(process.env.AVANTIQO_INTELLIGENCE_MODEL) || DEFAULT_MODEL;
const configuredFastModel = text(process.env.AVANTIQO_INTELLIGENCE_FAST_MODEL) || FAST_MODEL;
const existing = PROVIDER_REGISTRY[PROVIDER_ID] || {};
const modalOverflowConfigured = Boolean(
  intelligenceModalOverflowProposalWorkflowEnabled() &&
  positive(process.env.AVANTIQO_INTELLIGENCE_MODAL_H100_THB_PER_SECOND) &&
  intelligenceModalDirectConfigured()
);

PROVIDER_REGISTRY[PROVIDER_ID] = {
  ...existing,
  id: PROVIDER_ID,
  name: "Avantiqo Synthetic Intelligence",
  category: "ai",
  connectionModel: "managed",
  capabilities: ["ai.reasoning.execute", "ai.text.generate"],
  countries: ["*"],
  currencies: ["*"],
  runtime: "avantiqo_intelligence",
  runtimeAvailable,
  active: true,
  quality_score: score(process.env.AVANTIQO_INTELLIGENCE_QUALITY_SCORE, existing.quality_score ?? 94),
  speed_score: score(process.env.AVANTIQO_INTELLIGENCE_SPEED_SCORE, existing.speed_score ?? 76),
  reliability_score: score(process.env.AVANTIQO_INTELLIGENCE_RELIABILITY_SCORE, existing.reliability_score ?? 86),
  metadata: {
    ...(existing.metadata || {}),
    owned_by: "AVANTIQO",
    managed_by: "AVANTIQO",
    supplier_type: "OWNED_INFERENCE",
    infrastructure_provider: localComputeConfigured ? localInfrastructure : null,
    infrastructure_candidates: [
      ...(localComputeConfigured ? [localInfrastructure] : []),
      ...(modalOverflowConfigured ? ["MODAL_H100_ASYNC_V1"] : []),
    ],
    local_compute_primary: localComputeConfigured,
    local_compute_transport: localComputeConfigured ? localTransport : null,
    infrastructure_fallback: null,
    governed_overflow_infrastructure: "MODAL_H100_ASYNC_V1",
    governed_modal_overflow_supported: true,
    governed_modal_overflow_available: modalOverflowConfigured,
    automatic_modal_fallback_allowed: false,
    modal_overflow_owner_approval_required: true,
    modal_overflow_local_insufficiency_proof_required: true,
    modal_overflow_spend_ceiling_required: true,
    engine_contract: "AVANTIQO_SYNTHETIC_INTELLIGENCE_ENGINE_V2",
    product_model: "avantiqo-intelligence-v2",
    self_hosted_weights: true,
    open_weight_foundation: true,
    benchmark_gate: true,
    external_provider_fallback_allowed: false,
    governed_external_overflow_allowed: modalOverflowConfigured,
    data_control: "AVANTIQO",
    inference_control: "AVANTIQO",
    configured_model: configuredModel,
    configured_fast_model: configuredFastModel,
    foundation_models: [configuredModel, configuredFastModel, FRONT_MODEL],
    execution_lane_policy: "EXPLICIT_FRONT_FAST_OR_DEEP_WITH_CAPABILITY_DEFAULT_V2",
    execution_lanes: {
      front: { class_name: "FrontConversation", app_name: null, model_name: FRONT_MODEL, reasoning_mode: "NON_THINKING_ONLY", intended_workload: "BUSINESS_PARTNER_CONVERSATION_ONLY", tools_allowed: false, mutation_authority: false, memory_snapshot: false, local_primary: true, infrastructure_provider: localComputeConfigured ? localInfrastructure : null, modal_overflow_allowed: false },
      deep: { function_name: "deep", model_name: FRONT_MODEL, reasoning_mode: "THINKING_REQUIRED", intended_workload: "COMPLEX_STRATEGIC_REASONING", local_primary: true, local_context_tokens: 20480, local_output_cap_tokens: 8192, modal_overflow_allowed_with_approval: modalOverflowConfigured, overflow_model_name: configuredModel, overflow_infrastructure_provider: "MODAL_H100_ASYNC_V1" },
      fast: { function_name: "fast", model_name: configuredFastModel, reasoning_mode: "NON_THINKING_ONLY", intended_workload: "INTERACTIVE_CONVERSATION", local_primary: true, modal_overflow_allowed_with_approval: modalOverflowConfigured, overflow_infrastructure_provider: "MODAL_H100_ASYNC_V1", overflow_min_containers: 0, overflow_max_containers: 1, overflow_scaledown_window_seconds: 5 },
    },
    runtime_configuration: {
      enabled: engineEnabled,
      local_review_runtime_allowed: localReviewRuntimeAllowed,
      credential_transport: "LOCAL_NONE_MODAL_OVERFLOW_SERVER_ENV",
      server_secret_broker: null,
      supported_secret_reference_schemes: [],
      opaque_secret_reference_passthrough_allowed: false,
      runtime_credentials_required_at_execution: false,
      modal_overflow_server_credentials_required_at_submission: true,
      modal_overflow_requires_consumed_database_approval: true,
        local_compute_configured: localComputeConfigured,
      local_compute_primary: localComputeConfigured,
      local_compute_transport: localComputeConfigured ? localTransport : null,
      scale_to_zero: true,
      front_bounded_warm_idle_seconds: 120,
      front_min_containers: 1,
      fast_bounded_warm_idle_seconds: 120,
      deep_scale_to_zero: true,
      async_gateway: false,
      reasoning_mode: "LANE_ROUTED",
      deep_reasoning_mode: "THINKING_REQUIRED",
      front_reasoning_mode: "NON_THINKING_ONLY",
      fast_reasoning_mode: "NON_THINKING_ONLY",
      native_context_tokens: 262144,
      initial_served_context_tokens: 32768,
      raw_reasoning_persisted: false,
      safe_lease_required: false,
      automatic_modal_fallback_allowed: false,
      modal_overflow_only: true,
      modal_overflow_configured: modalOverflowConfigured,
      modal_overflow_approval_required: true,
      modal_overflow_local_insufficiency_proof_required: true,
    },
    intelligence_capabilities: {
      contract: "AVANTIQO_INTELLIGENCE_CAPABILITY_CONFIGURATION_V2",
      reasoning: true,
      thinking_required: false,
      thinking_required_for_deep_lane: true,
      fast_non_thinking: true,
      deep_thinking: true,
      text_generation: true,
      structured_output: true,
      tool_call_passthrough: true,
      organization_context_required: true,
      usage_metering_required: true,
    },
  },
};

export const AVANTIQO_INTELLIGENCE_PROVIDER_ID = PROVIDER_ID;
export const AVANTIQO_INTELLIGENCE_DEFAULT_MODEL = DEFAULT_MODEL;
export const AVANTIQO_INTELLIGENCE_FRONT_MODEL = FRONT_MODEL;
export const AVANTIQO_INTELLIGENCE_FAST_MODEL = FAST_MODEL;
