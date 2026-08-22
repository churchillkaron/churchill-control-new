import {
  PROVIDER_REGISTRY,
} from "@/lib/platform/service-runtime/providers/ProviderRegistry";

const PROVIDER_ID = "avantiqo-intelligence";
const DEFAULT_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";

function text(value) {
  return String(value ?? "").trim();
}

function score(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(0, Math.min(100, number))
    : fallback;
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

const runpodEndpointId = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID);
const runpodApiKey = text(process.env.RUNPOD_API_KEY);
const engineEnabled = enabled(process.env.AVANTIQO_INTELLIGENCE_ENGINE_ENABLED);
const runtimeAvailable = Boolean(engineEnabled && runpodEndpointId && runpodApiKey);
const configuredModel = text(process.env.AVANTIQO_INTELLIGENCE_MODEL) || DEFAULT_MODEL;
const existing = PROVIDER_REGISTRY[PROVIDER_ID] || {};

PROVIDER_REGISTRY[PROVIDER_ID] = {
  ...existing,
  id: PROVIDER_ID,
  name: "Avantiqo Synthetic Intelligence",
  category: "ai",
  connectionModel: "managed",
  capabilities: [
    "ai.reasoning.execute",
    "ai.text.generate",
  ],
  countries: ["*"],
  currencies: ["*"],
  runtime: "avantiqo_intelligence",
  runtimeAvailable,
  active: true,
  quality_score: score(
    process.env.AVANTIQO_INTELLIGENCE_QUALITY_SCORE,
    existing.quality_score ?? 94,
  ),
  speed_score: score(
    process.env.AVANTIQO_INTELLIGENCE_SPEED_SCORE,
    existing.speed_score ?? 76,
  ),
  reliability_score: score(
    process.env.AVANTIQO_INTELLIGENCE_RELIABILITY_SCORE,
    existing.reliability_score ?? 86,
  ),
  metadata: {
    ...(existing.metadata || {}),
    owned_by: "AVANTIQO",
    managed_by: "AVANTIQO",
    supplier_type: "OWNED_INFERENCE",
    infrastructure_provider: "RUNPOD_SERVERLESS",
    engine_contract: "AVANTIQO_SYNTHETIC_INTELLIGENCE_ENGINE_V1",
    product_model: "avantiqo-intelligence-v1",
    self_hosted_weights: true,
    open_weight_foundation: true,
    benchmark_gate: true,
    external_provider_fallback_allowed: true,
    data_control: "AVANTIQO",
    inference_control: "AVANTIQO",
    configured_model: configuredModel,
    foundation_models: [configuredModel],
    runpod_worker_contract: {
      contract: "AVANTIQO_QWEN3_RUNPOD_VLLM_WORKER_V1",
      model_name: DEFAULT_MODEL,
      required_environment: {
        REASONING_PARSER: "qwen3",
        ENABLE_AUTO_TOOL_CHOICE: "true",
        TOOL_CALL_PARSER: "hermes",
      },
      reasoning_separation_required: true,
      native_tool_calls_required: true,
      structured_output_required: true,
      source_basis: "RUNPOD_VLLM_QWEN3_CONFIGURATION",
    },
    runtime_configuration: {
      enabled: engineEnabled,
      runpod_endpoint_configured: Boolean(runpodEndpointId),
      runpod_api_key_configured: Boolean(runpodApiKey),
      openai_compatible_transport: true,
      scale_to_zero: true,
      reasoning_mode: "THINKING_REQUIRED",
      native_context_tokens: 262144,
      initial_served_context_tokens: 131072,
      raw_reasoning_persisted: false,
    },
    intelligence_capabilities: {
      contract: "AVANTIQO_INTELLIGENCE_CAPABILITY_CONFIGURATION_V1",
      reasoning: true,
      thinking_required: true,
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
