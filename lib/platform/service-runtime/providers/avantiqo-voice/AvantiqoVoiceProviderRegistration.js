import { PROVIDER_REGISTRY } from "@/lib/platform/service-runtime/providers/ProviderRegistry";

const PROVIDER_ID = "avantiqo-voice";
const IMPLEMENTED_CAPABILITIES = Object.freeze([
  "ai.speech.to.text",
  "ai.text.to.speech",
]);
const TARGET_CAPABILITIES = Object.freeze([
  ...IMPLEMENTED_CAPABILITIES,
  "ai.speech.to.text.realtime",
  "ai.voice.generate",
  "ai.voice.dub",
  "ai.voice.repair",
]);
const DEFAULT_STT_FOUNDATION_MODEL = "openai/whisper-large-v3-turbo";
const DEFAULT_TTS_FOUNDATION_MODEL = "resemble-ai/chatterbox:multilingual-v3";
const CANONICAL_STT_ENDPOINT_NAME = "avantiqo-voice-stt-v1";
const CANONICAL_TTS_ENDPOINT_NAME = "avantiqo-voice-tts-v1";
const MODAL_APP_NAME = "avantiqo-voice-owned";

function text(value) { return String(value ?? "").trim(); }
function disabled(value) { return ["0", "false", "no", "off"].includes(text(value).toLowerCase()); }
function score(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : fallback;
}
function requestedCapabilities(value) {
  const configured = text(value).split(",").map((item) => item.trim()).filter((item) => IMPLEMENTED_CAPABILITIES.includes(item));
  return configured.length ? [...new Set(configured)] : [...IMPLEMENTED_CAPABILITIES];
}

const engineSetting = text(process.env.AVANTIQO_VOICE_ENGINE_ENABLED);
const engineEnabled = engineSetting ? !disabled(engineSetting) : true;
const apiKey = text(process.env.RUNPOD_API_KEY);
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY) || apiKey;
const sttEndpointId = text(process.env.RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID);
const ttsEndpointId = text(process.env.RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID);
const modalTokenId = text(process.env.MODAL_TOKEN_ID || process.env.AVANTIQO_MODAL_TOKEN_ID);
const modalTokenSecret = text(process.env.MODAL_TOKEN_SECRET || process.env.AVANTIQO_MODAL_TOKEN_SECRET);
const modalDirectConfigured = Boolean(modalTokenId && modalTokenSecret);
const legacyModalBaseUrl = text(process.env.AVANTIQO_VOICE_MODAL_BASE_URL);
const legacyModalGatewayToken = text(process.env.AVANTIQO_VOICE_MODAL_GATEWAY_TOKEN);
const legacyModalGatewayConfigured = Boolean(
  /^https:\/\//i.test(legacyModalBaseUrl) && legacyModalGatewayToken.length >= 40,
);
const runpodConfigured = Boolean(apiKey && managementKey);
const sttFoundationModel = text(process.env.AVANTIQO_VOICE_STT_FOUNDATION_MODEL) || DEFAULT_STT_FOUNDATION_MODEL;
const ttsFoundationModel = text(process.env.AVANTIQO_VOICE_TTS_FOUNDATION_MODEL) || DEFAULT_TTS_FOUNDATION_MODEL;
const requested = requestedCapabilities(process.env.AVANTIQO_VOICE_CERTIFIED_CAPABILITIES);
const capabilities = requested.filter((capability) => {
  if (capability === "ai.speech.to.text") return Boolean(sttFoundationModel);
  if (capability === "ai.text.to.speech") return Boolean(ttsFoundationModel);
  return false;
});
const runtimeAvailable = Boolean(
  engineEnabled && (modalDirectConfigured || legacyModalGatewayConfigured || runpodConfigured) && capabilities.length,
);
const existing = PROVIDER_REGISTRY[PROVIDER_ID] || {};

PROVIDER_REGISTRY[PROVIDER_ID] = {
  ...existing,
  id: PROVIDER_ID,
  name: "Avantiqo Voice",
  category: "ai",
  connectionModel: "managed",
  capabilities,
  countries: ["*"],
  currencies: ["*"],
  runtime: "avantiqo_voice",
  runtimeAvailable,
  active: true,
  quality_score: score(process.env.AVANTIQO_VOICE_ENGINE_QUALITY_SCORE, existing.quality_score ?? 90),
  speed_score: score(process.env.AVANTIQO_VOICE_ENGINE_SPEED_SCORE, existing.speed_score ?? 90),
  reliability_score: score(process.env.AVANTIQO_VOICE_ENGINE_RELIABILITY_SCORE, existing.reliability_score ?? 88),
  metadata: {
    ...(existing.metadata || {}),
    owned_by: "AVANTIQO",
    managed_by: "AVANTIQO",
    supplier_type: "OWNED_INFERENCE",
    infrastructure_provider: modalDirectConfigured
      ? "MODAL_A10G_ASYNC_V1"
      : legacyModalGatewayConfigured
        ? "MODAL_A10G_ASYNC_V1"
        : "RUNPOD_SERVERLESS",
    infrastructure_candidates: ["MODAL_A10G_ASYNC_V1", "RUNPOD_SERVERLESS"],
    modal_primary_when_configured: true,
    modal_direct_primary: true,
    simultaneous_modal_runpod_execution_forbidden: true,
    engine_contract: "AVANTIQO_VOICE_ENGINE_V1",
    modal_app: MODAL_APP_NAME,
    modal_direct_transport: "modal-js-sdk-function-call-v1",
    modal_functions: { stt: "transcribe", tts: "speak" },
    legacy_modal_http_contract: "AVANTIQO_VOICE_MODAL_HTTP_V1",
    legacy_modal_gateway_migration_debt: true,
    tts_quality_contract: "AVANTIQO_VOICE_TTS_QUALITY_V2",
    voice_reference_contract: "AVANTIQO_VOICE_REFERENCE_V1",
    product_model: "avantiqo-voice-v2",
    product_models: { stt: "avantiqo-voice-stt-v1", tts: "avantiqo-voice-tts-v2" },
    benchmark_gate: true,
    external_provider_fallback_allowed: false,
    owned_only_required: true,
    provider_selection_exposed: false,
    raw_reasoning_persisted: false,
    target_capabilities: TARGET_CAPABILITIES,
    implemented_capabilities: IMPLEMENTED_CAPABILITIES,
    certified_capabilities: capabilities,
    realtime_streaming_certified: false,
    voice_cloning_certified: false,
    recorded_reference_voice_implemented: true,
    recorded_reference_voice_certified: false,
    recorded_reference_requires_consent: true,
    recorded_reference_supported_consent_bases: ["SELF", "AUTHORIZED", "LICENSED"],
    recorded_reference_min_seconds: 3,
    recorded_reference_max_seconds: 30,
    recorded_reference_max_bytes: 20 * 1024 * 1024,
    recorded_reference_supported_mime_types: [
      "audio/wav", "audio/mpeg", "audio/mp4", "audio/webm", "audio/ogg", "audio/flac",
    ],
    voice_delivery_profiles: [
      "avantiqo-secretary-v1", "avantiqo-executive-v1", "avantiqo-warm-v1", "avantiqo-neutral-v1",
    ],
    long_form_tts_implemented: true,
    output_audio_health_gate_implemented: true,
    tts_final_artifact_persistence: "AVANTIQO_SERVICE_RUNTIME",
    foundation_models: [sttFoundationModel, ttsFoundationModel],
    configured_foundation_models: { stt: sttFoundationModel, tts: ttsFoundationModel },
    runtime_configuration: {
      enabled: engineEnabled,
      modal_configured: modalDirectConfigured,
      modal_direct_configured: modalDirectConfigured,
      modal_token_id_configured: Boolean(modalTokenId),
      modal_token_secret_configured: Boolean(modalTokenSecret),
      modal_app: MODAL_APP_NAME,
      modal_stt_function: "transcribe",
      modal_tts_function: "speak",
      modal_gateway_required: false,
      legacy_modal_gateway_configured: legacyModalGatewayConfigured,
      modal_gpu: "A10G",
      modal_persistent_model_volume: false,
      modal_max_gpu_containers_per_function: 1,
      runpod_fallback_configured: runpodConfigured,
      runpod_api_key_configured: Boolean(apiKey),
      runpod_management_api_key_configured: Boolean(managementKey),
      stt_endpoint_configured: Boolean(sttEndpointId),
      tts_endpoint_configured: Boolean(ttsEndpointId),
      stt_endpoint_discovery_enabled: !modalDirectConfigured && !legacyModalGatewayConfigured,
      tts_endpoint_discovery_enabled: !modalDirectConfigured && !legacyModalGatewayConfigured,
      stt_endpoint_name: CANONICAL_STT_ENDPOINT_NAME,
      tts_endpoint_name: CANONICAL_TTS_ENDPOINT_NAME,
      stt_foundation_model_configured: true,
      tts_foundation_model_configured: true,
      synchronous_operator_voice: false,
      async_gateway: false,
      direct_async_function_call: true,
      realtime_streaming: false,
      scale_to_zero: true,
      runpod_submission_requires_safe_lease: !modalDirectConfigured && !legacyModalGatewayConfigured,
    },
  },
};

export const AVANTIQO_VOICE_PROVIDER_ID = PROVIDER_ID;
