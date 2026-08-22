import { PROVIDER_REGISTRY } from "@/lib/platform/service-runtime/providers/ProviderRegistry";

const PROVIDER_ID = "avantiqo-code";

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

const endpointId = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
const apiKey = text(process.env.RUNPOD_API_KEY);
const engineEnabled = enabled(process.env.AVANTIQO_CODE_ENGINE_ENABLED);
const runtimeAvailable = Boolean(engineEnabled && endpointId && apiKey);
const existing = PROVIDER_REGISTRY[PROVIDER_ID] || {};

PROVIDER_REGISTRY[PROVIDER_ID] = {
  ...existing,
  id: PROVIDER_ID,
  name: "Avantiqo Code",
  category: "ai",
  connectionModel: "managed",
  capabilities: [
    "ai.code.generate",
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
  ],
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
    infrastructure_provider: "RUNPOD_SERVERLESS",
    engine_contract: "AVANTIQO_CODE_ENGINE_V1",
    product_model: "avantiqo-code-v1",
    benchmark_gate: true,
    external_provider_fallback_allowed: true,
    raw_reasoning_persisted: false,
    runtime_configuration: {
      enabled: engineEnabled,
      runpod_endpoint_configured: Boolean(endpointId),
      runpod_api_key_configured: Boolean(apiKey),
      queue_endpoint: true,
      scale_to_zero: true,
    },
  },
};

export const AVANTIQO_CODE_PROVIDER_ID = PROVIDER_ID;
