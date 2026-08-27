import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_VOICE_TTS_V2_CONTRACT_AUDIT_V1";
const HANDLER_PATH = "services/avantiqo-voice-tts/handler.py";
const PROVIDER_PATH = "lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceProvider.js";

function requireIncludes(source, needle, code) {
  if (!source.includes(needle)) throw new Error(`${CONTRACT}_${code}`);
}

const [handler, provider] = await Promise.all([
  readFile(HANDLER_PATH, "utf8"),
  readFile(PROVIDER_PATH, "utf8"),
]);

const handlerChecks = [
  ["PRODUCT_MODEL = \"avantiqo-voice-tts-v2\"", "HANDLER_PRODUCT_MODEL_V2_REQUIRED"],
  ["QUALITY_CONTRACT = \"AVANTIQO_VOICE_TTS_QUALITY_V2\"", "HANDLER_QUALITY_CONTRACT_REQUIRED"],
  ["VOICE_REFERENCE_CONTRACT = \"AVANTIQO_VOICE_REFERENCE_V1\"", "HANDLER_REFERENCE_CONTRACT_REQUIRED"],
  ["\"avantiqo-secretary-v1\"", "HANDLER_SECRETARY_PROFILE_REQUIRED"],
  ["\"avantiqo-executive-v1\"", "HANDLER_EXECUTIVE_PROFILE_REQUIRED"],
  ["\"avantiqo-warm-v1\"", "HANDLER_WARM_PROFILE_REQUIRED"],
  ["\"avantiqo-neutral-v1\"", "HANDLER_NEUTRAL_PROFILE_REQUIRED"],
  ["CONSENT_BASES = {\"SELF\", \"AUTHORIZED\", \"LICENSED\"}", "HANDLER_CONSENT_BASES_REQUIRED"],
  ["voice_profile", "HANDLER_VOICE_PROFILE_REQUIRED"],
  ["voice_reference", "HANDLER_VOICE_REFERENCE_REQUIRED"],
  ["audio_health", "HANDLER_AUDIO_HEALTH_REQUIRED"],
  ["voice_cloning_used", "HANDLER_CLONING_EVIDENCE_REQUIRED"],
  ["watermarking", "HANDLER_WATERMARK_EVIDENCE_REQUIRED"],
  ["raw_reasoning_persisted", "HANDLER_REASONING_GUARD_REQUIRED"],
];

const providerChecks = [
  ["productModel: \"avantiqo-voice-tts-v2\"", "PROVIDER_PRODUCT_MODEL_V2_REQUIRED"],
  ["resolveVoiceReferenceForExecution", "PROVIDER_LIBRARY_RESOLVER_REQUIRED"],
  ["voiceProfile: explicitDeliveryProfile || \"avantiqo-secretary-v1\"", "PROVIDER_DIRECT_REFERENCE_DEFAULT_PROFILE_REQUIRED"],
  ["\"avantiqo-secretary-v1\"", "PROVIDER_SECRETARY_DEFAULT_REQUIRED"],
  ["voice_profile: ttsVoiceSelection.voiceProfile", "PROVIDER_PROFILE_FORWARDING_REQUIRED"],
  ["voice_reference: ttsVoiceSelection.voiceReference", "PROVIDER_REFERENCE_FORWARDING_REQUIRED"],
  ["recorded_reference_voice_requested", "PROVIDER_REFERENCE_EVIDENCE_REQUIRED"],
  ["voice_delivery_profile", "PROVIDER_DELIVERY_EVIDENCE_REQUIRED"],
  ["AVANTIQO_VOICE_REFERENCE_CONSENT_REQUIRED", "PROVIDER_CONSENT_GUARD_REQUIRED"],
  ["AVANTIQO_RUNPOD_SAFE_LEASE_V2", "PROVIDER_SAFE_LEASE_REQUIRED"],
  ["raw_reasoning_persisted: false", "PROVIDER_REASONING_GUARD_REQUIRED"],
];

for (const [needle, code] of handlerChecks) requireIncludes(handler, needle, code);
for (const [needle, code] of providerChecks) requireIncludes(provider, needle, code);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  tts_only: true,
  handler_path: HANDLER_PATH,
  provider_path: PROVIDER_PATH,
  product_model: "avantiqo-voice-tts-v2",
  quality_contract: "AVANTIQO_VOICE_TTS_QUALITY_V2",
  voice_reference_contract: "AVANTIQO_VOICE_REFERENCE_V1",
  secretary_profile: "avantiqo-secretary-v1",
  recorded_reference_voice_supported: true,
  consent_guarded: true,
  organization_voice_library_supported: true,
  safe_lease_required: true,
  generation_submitted: false,
  mutation_performed: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
}, null, 2));
