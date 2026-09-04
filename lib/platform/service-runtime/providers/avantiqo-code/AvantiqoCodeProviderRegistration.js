import { PROVIDER_REGISTRY } from "@/lib/platform/service-runtime/providers/ProviderRegistry";

const PROVIDER_ID = "avantiqo-code";
const CANONICAL_FOUNDATION_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct";
const CERTIFICATION_CONTRACT = "AVANTIQO_CODE_QWEN38_PRIVATE12_CERT_V17";
const CERTIFIED_RUNTIME_CONTRACT = "AVANTIQO_CODE_QWEN38_CANARY_RUNTIME_V10";
const TARGET_CAPABILITIES = Object.freeze([
  "ai.code.generate",
  "ai.code.invent",
  "ai.code.edit",
  "ai.code.refactor",
  "ai.code.review",
  "ai.code.debug",
  "ai.code.test",
  "ai.code.execute",
  "ai.web.build",
  "ai.web.repair",
  "ai.app.build",
  "ai.integration.build",
]);

function text(value) {
  return String(value ?? "").trim();
}

function score(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : fallback;
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

function certifiedCapabilities(value) {
  const configured = text(value)
    .split(",")
    .map((item) => item.trim())
    .filter((item) => TARGET_CAPABILITIES.includes(item));
  return configured.length
    ? [...new Set(configured)]
    : [
        "ai.code.generate",
        "ai.code.invent",
        "ai.code.edit",
        "ai.code.refactor",
        "ai.code.review",
        "ai.code.debug",
      ];
}

const endpointId = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
const apiKey = text(process.env.RUNPOD_API_KEY);
const modalBaseUrl = text(process.env.AVANTIQO_CODE_MODAL_BASE_URL);
const modalGatewayToken = text(process.env.AVANTIQO_CODE_MODAL_GATEWAY_TOKEN);
const modalProxyTokenId = text(process.env.AVANTIQO_CODE_MODAL_PROXY_TOKEN_ID);
const modalProxyTokenSecret = text(process.env.AVANTIQO_CODE_MODAL_PROXY_TOKEN_SECRET);
const configuredFoundationModel = text(process.env.AVANTIQO_CODE_FOUNDATION_MODEL);
const foundationModel = CANONICAL_FOUNDATION_MODEL;
const foundationModelContractValid = Boolean(
  !configuredFoundationModel || configuredFoundationModel === foundationModel,
);
const engineEnabled = enabled(process.env.AVANTIQO_CODE_ENGINE_ENABLED);
const capabilities = certifiedCapabilities(process.env.AVANTIQO_CODE_CERTIFIED_CAPABILITIES);
const runpodConfigured = Boolean(endpointId && apiKey);
const modalGatewayConfigured = Boolean(modalBaseUrl && modalGatewayToken.length >= 40);
const modalProxyConfigured = Boolean(
  modalBaseUrl &&
  modalProxyTokenId.startsWith("wk-") &&
  modalProxyTokenSecret.startsWith("ws-"),
);
const modalConfigured = Boolean(modalGatewayConfigured || modalProxyConfigured);
const runtimeAvailable = Boolean(
  engineEnabled &&
  (modalConfigured || runpodConfigured) &&
  foundationModelContractValid &&
  capabilities.length,
);
const existing = PROVIDER_REGISTRY[PROVIDER_ID] || {};

PROVIDER_REGISTRY[PROVIDER_ID] = {
  ...existing,
  id: PROVIDER_ID,
  name: "Avantiqo Code",
  category: "ai",
  connectionModel: "managed",
  capabilities,
  countries: ["*"],
  currencies: ["*"],
  runtime: "avantiqo_code",
  runtimeAvailable,
  active: true,
  quality_score: score(process.env.AVANTIQO_CODE_ENGINE_QUALITY_SCORE, existing.quality_score ?? 92),
  speed_score: score(process.env.AVANTIQO_CODE_ENGINE_SPEED_SCORE, existing.speed_score ?? 80),
  reliability_score: score(process.env.AVANTIQO_CODE_ENGINE_RELIABILITY_SCORE, existing.reliability_score ?? 86),
  metadata: {
    ...(existing.metadata || {}),
    owned_by: "AVANTIQO",
    managed_by: "AVANTIQO",
    supplier_type: "OWNED_INFERENCE",
    infrastructure_provider: modalConfigured ? "MODAL_H100_ASYNC_V1" : "RUNPOD_SERVERLESS",
    infrastructure_candidates: ["MODAL_H100_ASYNC_V1", "RUNPOD_SERVERLESS"],
    engine_contract: "AVANTIQO_CODE_ENGINE_V1",
    product_model: "avantiqo-code-v1",
    certification_contract: CERTIFICATION_CONTRACT,
    certified_runtime_contract: CERTIFIED_RUNTIME_CONTRACT,
    certification_generation: "V17",
    certification_status: "PASS",
    certified_repository_agent: "repo_agent_v15",
    certified_speculative_decoding: {
      enabled: true,
      method: "mtp",
      speculative_tokens: 1,
      second_model_used: false,
    },
    benchmark_gate: true,
    owned_only_required: true,
    external_provider_fallback_allowed: false,
    raw_reasoning_persisted: false,
    target_capabilities: TARGET_CAPABILITIES,
    certified_capabilities: capabilities,
    inventor: {
      capability: "ai.code.invent",
      contract: "AVANTIQO_CODE_INVENTOR_V1",
      strategy: "divergent-3+adversarial-judge+final-synthesis",
      single_gpu_function: true,
      concurrent_gpu_fanout: false,
      intermediate_outputs_persisted: false,
      opt_in_high_compute_mode: true,
    },
    foundation_model: foundationModel,
    foundation_model_source_locked: true,
    configured_foundation_model: configuredFoundationModel || null,
    runtime_configuration: {
      enabled: engineEnabled,
      modal_primary_when_configured: true,
      modal_base_url_configured: Boolean(modalBaseUrl),
      modal_gateway_auth_configured: modalGatewayConfigured,
      modal_proxy_auth_configured: modalProxyConfigured,
      runpod_endpoint_configured: Boolean(endpointId),
      runpod_api_key_configured: Boolean(apiKey),
      foundation_model_source_locked: true,
      foundation_model_env_present: Boolean(configuredFoundationModel),
      foundation_model_env_matches: foundationModelContractValid,
      certified_runtime_contract: CERTIFIED_RUNTIME_CONTRACT,
      certification_contract: CERTIFICATION_CONTRACT,
      production_routing_changed_by_certification: false,
      queue_endpoint: true,
      scale_to_zero: true,
    },
  },
};

export const AVANTIQO_CODE_PROVIDER_ID = PROVIDER_ID;
export const AVANTIQO_CODE_CERTIFICATION_CONTRACT = CERTIFICATION_CONTRACT;
export const AVANTIQO_CODE_CERTIFIED_RUNTIME_CONTRACT = CERTIFIED_RUNTIME_CONTRACT;
