import { PROVIDER_REGISTRY } from "@/lib/platform/service-runtime/providers/ProviderRegistry";

const PROVIDER_ID = "avantiqo-audio";
const DEFAULT_CERTIFIED_CAPABILITIES = Object.freeze(["ai.music.generate"]);
const LOCAL_IMPLEMENTED_CAPABILITIES = Object.freeze([
  "ai.music.generate",
  "ai.sfx.generate",
  "ai.audio.stems",
  "ai.audio.vocal-correct",
  "ai.audio.elastic-warp",
]);
const TARGET_CAPABILITIES = Object.freeze([
  ...LOCAL_IMPLEMENTED_CAPABILITIES,
  "ai.audio.generate",
  "ai.audio.edit",
  "ai.audio.extend",
  "ai.audio.remix",
  "ai.audio.vocal-role-separate",
  "ai.audio.mix",
  "ai.audio.master",
]);
const QUALITY_PROFILE = "ACE_STEP_1_5_XL_TURBO_1_7B_LM_V1";
const STEM_SEPARATOR_MODEL = "facebookresearch/demucs:htdemucs_ft";
const STEM_SEPARATOR_PROFILE = "DEMUCS_HTDEMUCS_FT_4STEM_V1";
const VOCAL_CORRECTION_MODEL = "torchcrepe-full";
const VOCAL_CORRECTION_QUALITY_PROFILE = "TORCHCREPE_SIGNALSMITH_VOCAL_CORRECTION_V2";
const ELASTIC_AUDIO_MODEL = "signalsmith-stretch";
const ELASTIC_AUDIO_QUALITY_PROFILE = "SIGNALSMITH_REVIEWED_TRANSIENT_WARP_V1";
const SFX_FOUNDATION_MODEL = "OpenMOSS-Team/MOSS-SoundEffect-v2.0";
const SFX_QUALITY_PROFILE = "MOSS_SOUNDEFFECT_V2_48KHZ_V1";
const SOURCE_AUDIO_RIGHTS_ATTESTATION_CONTRACT = "AVANTIQO_SOURCE_AUDIO_RIGHTS_ATTESTATION_V1";
const SOURCE_AUDIO_CONTENT_POLICY = "USER_RIGHTS_ATTESTATION_ONLY";

function text(value) { return String(value ?? "").trim(); }
function enabled(value) { return ["1", "true", "yes", "on"].includes(text(value).toLowerCase()); }
function score(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : fallback;
}
function sha256(value) { return /^[a-f0-9]{64}$/i.test(text(value)); }

function certifiedCapabilities(value) {
  const requested = text(value).split(",").map((item) => item.trim()).filter(Boolean);
  const source = requested.length ? requested : DEFAULT_CERTIFIED_CAPABILITIES;
  const unsupported = source.filter((item) => !LOCAL_IMPLEMENTED_CAPABILITIES.includes(item));
  if (unsupported.length) {
    throw new Error(`AVANTIQO_AUDIO_LOCAL_CAPABILITY_NOT_IMPLEMENTED:${unsupported.join(",")}`);
  }
  if (!source.includes("ai.music.generate")) {
    throw new Error("AVANTIQO_AUDIO_MUSIC_GENERATION_CERTIFICATION_REQUIRED");
  }
  return [...new Set(source)];
}

const engineEnabled = enabled(process.env.AVANTIQO_AUDIO_ENGINE_ENABLED);
const localComputeConfigured = enabled(process.env.AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED ?? "true");
const certified = certifiedCapabilities(process.env.AVANTIQO_AUDIO_CERTIFIED_CAPABILITIES);
const localMusicEnabled = !text(process.env.AVANTIQO_LOCAL_MUSIC_GENERATION_ENABLED) || enabled(process.env.AVANTIQO_LOCAL_MUSIC_GENERATION_ENABLED);
const separatorCertified = enabled(process.env.AVANTIQO_MUSIC_SEPARATOR_ENGINE_CERTIFIED);
const vocalCorrectionCertified = enabled(process.env.AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_CERTIFIED);
const elasticCertified = enabled(process.env.AVANTIQO_MUSIC_ELASTIC_ENGINE_CERTIFIED);
const sfxEngineEnabled = enabled(process.env.AVANTIQO_SFX_ENGINE_ENABLED);
const sfxEngineCertified = enabled(process.env.AVANTIQO_SFX_ENGINE_CERTIFIED);
const sfxEvidence = text(process.env.AVANTIQO_SFX_CERTIFICATION_EVIDENCE_SHA256);
const sfxEvidenceBound = sha256(sfxEvidence);

const availability = Object.freeze({
  "ai.music.generate": engineEnabled && localComputeConfigured && localMusicEnabled && certified.includes("ai.music.generate"),
  "ai.sfx.generate": engineEnabled && localComputeConfigured && sfxEngineEnabled && sfxEngineCertified && sfxEvidenceBound && certified.includes("ai.sfx.generate"),
  "ai.audio.stems": engineEnabled && localComputeConfigured && separatorCertified && certified.includes("ai.audio.stems"),
  "ai.audio.vocal-correct": engineEnabled && localComputeConfigured && vocalCorrectionCertified && certified.includes("ai.audio.vocal-correct"),
  "ai.audio.elastic-warp": engineEnabled && localComputeConfigured && elasticCertified && certified.includes("ai.audio.elastic-warp"),
});
const capabilities = LOCAL_IMPLEMENTED_CAPABILITIES.filter((capability) => availability[capability]);
const existing = PROVIDER_REGISTRY[PROVIDER_ID] || {};

PROVIDER_REGISTRY[PROVIDER_ID] = {
  ...existing,
  id: PROVIDER_ID,
  name: "Avantiqo Music",
  category: "ai",
  connectionModel: "managed",
  capabilities,
  countries: ["*"],
  currencies: ["*"],
  runtime: "avantiqo_audio",
  runtimeAvailable: capabilities.length > 0,
  active: true,
  quality_score: score(process.env.AVANTIQO_AUDIO_ENGINE_QUALITY_SCORE, existing.quality_score ?? 90),
  speed_score: score(process.env.AVANTIQO_AUDIO_ENGINE_SPEED_SCORE, existing.speed_score ?? 76),
  reliability_score: score(process.env.AVANTIQO_AUDIO_ENGINE_RELIABILITY_SCORE, existing.reliability_score ?? 84),
  metadata: {
    ...(existing.metadata || {}),
    owned_by: "AVANTIQO",
    managed_by: "AVANTIQO",
    supplier_type: "OWNED_INFERENCE",
    infrastructure_provider: "AVANTIQO_LOCAL_NODE_V1",
    infrastructure_candidates: ["AVANTIQO_LOCAL_NODE_V1"],
    local_only_execution: true,
    local_first: true,
    cloud_fallback_allowed: false,
    external_provider_fallback_allowed: false,
    engine_contract: "AVANTIQO_AUDIO_ENGINE_V1",
    product_model: "avantiqo-music-v1",
    quality_profile: QUALITY_PROFILE,
    benchmark_gate: true,
    provider_selection_exposed: false,
    raw_reasoning_persisted: false,
    target_capabilities: TARGET_CAPABILITIES,
    implemented_capabilities: LOCAL_IMPLEMENTED_CAPABILITIES,
    certifiable_capabilities: LOCAL_IMPLEMENTED_CAPABILITIES,
    certified_capabilities: capabilities,
    default_certified_capabilities: DEFAULT_CERTIFIED_CAPABILITIES,
    benchmark_required_capabilities: LOCAL_IMPLEMENTED_CAPABILITIES.filter((capability) => !DEFAULT_CERTIFIED_CAPABILITIES.includes(capability)),
    local_music_runtime: {
      model: "ACE-Step/Ace-Step1.5",
      runtime_variant: "acestep-v15-turbo",
      resource: "CPU_FLOAT32",
      use_lm: false,
      default_inference_steps: 8,
      proven_full_song_seconds: 210,
      production_routing_allowed: availability["ai.music.generate"],
    },
    sfx_runtime: {
      owner: "AVANTIQO",
      capability: "ai.sfx.generate",
      foundation_model: SFX_FOUNDATION_MODEL,
      quality_profile: SFX_QUALITY_PROFILE,
      infrastructure_provider: "AVANTIQO_LOCAL_NODE_V1",
      runtime_status: availability["ai.sfx.generate"] ? "CERTIFIED_CONFIGURED" : "CERTIFICATION_OR_CONFIGURATION_REQUIRED",
      production_routing_allowed: availability["ai.sfx.generate"],
      certification_required: true,
      certification_evidence_sha256: sfxEvidenceBound ? sfxEvidence : null,
      external_provider_fallback_allowed: false,
    },
    separator_runtime: {
      owner: "AVANTIQO",
      capability: "ai.audio.stems",
      model: STEM_SEPARATOR_MODEL,
      quality_profile: STEM_SEPARATOR_PROFILE,
      infrastructure_provider: "AVANTIQO_LOCAL_NODE_V1",
      runtime_status: availability["ai.audio.stems"] ? "CERTIFIED_CONFIGURED" : "CERTIFICATION_OR_CONFIGURATION_REQUIRED",
      production_routing_allowed: availability["ai.audio.stems"],
      certification_required: true,
      rights_attestation_required: true,
      rights_attestation_contract: SOURCE_AUDIO_RIGHTS_ATTESTATION_CONTRACT,
      content_restriction_policy: SOURCE_AUDIO_CONTENT_POLICY,
      stems: ["vocals", "drums", "bass", "other"],
    },
    vocal_correction_runtime: {
      owner: "AVANTIQO",
      capability: "ai.audio.vocal-correct",
      model: VOCAL_CORRECTION_MODEL,
      quality_profile: VOCAL_CORRECTION_QUALITY_PROFILE,
      infrastructure_provider: "AVANTIQO_LOCAL_NODE_V1",
      runtime_status: availability["ai.audio.vocal-correct"] ? "CERTIFIED_CONFIGURED" : "CERTIFICATION_OR_CONFIGURATION_REQUIRED",
      production_routing_allowed: availability["ai.audio.vocal-correct"],
      certification_required: true,
      external_provider_fallback_allowed: false,
    },
    elastic_audio_runtime: {
      owner: "AVANTIQO",
      capability: "ai.audio.elastic-warp",
      model: ELASTIC_AUDIO_MODEL,
      quality_profile: ELASTIC_AUDIO_QUALITY_PROFILE,
      infrastructure_provider: "AVANTIQO_LOCAL_NODE_V1",
      runtime_status: availability["ai.audio.elastic-warp"] ? "CERTIFIED_CONFIGURED" : "CERTIFICATION_OR_CONFIGURATION_REQUIRED",
      production_routing_allowed: availability["ai.audio.elastic-warp"],
      certification_required: true,
      external_provider_fallback_allowed: false,
    },
    foundation_models: [
      "ACE-Step/Ace-Step1.5",
      SFX_FOUNDATION_MODEL,
      STEM_SEPARATOR_MODEL,
      VOCAL_CORRECTION_MODEL,
      ELASTIC_AUDIO_MODEL,
    ],
    runtime_configuration: {
      enabled: engineEnabled,
      local_compute_configured: localComputeConfigured,
      local_only: true,
      cloud_fallback_allowed: false,
      queue_endpoint: true,
      scale_to_zero: false,
    },
  },
};

export const AVANTIQO_AUDIO_PROVIDER_ID = PROVIDER_ID;
