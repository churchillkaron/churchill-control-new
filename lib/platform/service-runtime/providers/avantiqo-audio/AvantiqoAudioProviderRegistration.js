import { PROVIDER_REGISTRY } from "@/lib/platform/service-runtime/providers/ProviderRegistry";

const PROVIDER_ID = "avantiqo-audio";
const LOCAL_CAPABILITIES = Object.freeze([
  "ai.music.generate",
  "ai.sfx.generate",
  "ai.audio.stems",
  "ai.audio.vocal-correct",
  "ai.audio.elastic-warp",
]);
const TARGET_CAPABILITIES = Object.freeze([
  ...LOCAL_CAPABILITIES,
  "ai.audio.generate",
  "ai.audio.edit",
  "ai.audio.extend",
  "ai.audio.remix",
  "ai.audio.vocal-role-separate",
  "ai.audio.mix",
  "ai.audio.master",
]);
const QUALITY_PROFILE = "ACE_STEP_1_5_XL_TURBO_1_7B_LM_V1";
const EXPECTED_MODEL_VARIANT = "acestep-v15-xl-turbo";
const EXPECTED_LM_MODEL = "acestep-5Hz-lm-1.7B";
const EXPECTED_LM_BACKEND = "vllm";
const STEM_SEPARATOR_MODEL = "facebookresearch/demucs:htdemucs_ft";
const STEM_SEPARATOR_LANE = "demucs-htdemucs-ft";
const STEM_SEPARATOR_PROFILE = "DEMUCS_HTDEMUCS_FT_4STEM_V1";
const SEPARATOR_CANDIDATE_MODEL = "mel_band_roformer_karaoke_aufr33_viperx";
const VOCAL_ROLE_SEPARATOR_MODEL = "UVR_MDXNET_KARA_2.onnx";
const VOCAL_ROLE_SEPARATOR_MODEL_SHA256 = "bf32e15105a09c0f7dddd2b67346146334d6f3ecb399ed7638eba2ab07cbf5f4";
const VOCAL_ROLE_SEPARATOR_MODEL_LICENSE = "MIT";
const VOCAL_ROLE_SEPARATOR_PROFILE = "DEMUCS_HTDEMUCS_FT_PLUS_UVR_KARA2_VOCAL_ROLE_RESEARCH_V1";
const VOCAL_ROLE_SEPARATOR_STATUS = "RESEARCH_RUNTIME_IMPLEMENTED_CERTIFICATION_REQUIRED";
const VOCAL_CORRECTION_MODEL = "torchcrepe-full";
const VOCAL_CORRECTION_ENGINE_CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2";
const VOCAL_CORRECTION_QUALITY_PROFILE = "TORCHCREPE_SIGNALSMITH_VOCAL_CORRECTION_V2";
const ELASTIC_AUDIO_MODEL = "signalsmith-stretch";
const ELASTIC_AUDIO_ENGINE_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_AUDIO_ENGINE_V1";
const ELASTIC_AUDIO_QUALITY_PROFILE = "SIGNALSMITH_REVIEWED_TRANSIENT_WARP_V1";
const SOURCE_AUDIO_RIGHTS_ATTESTATION_CONTRACT = "AVANTIQO_SOURCE_AUDIO_RIGHTS_ATTESTATION_V1";
const SOURCE_AUDIO_CONTENT_POLICY = "USER_RIGHTS_ATTESTATION_ONLY";
const SOURCE_AUDIO_MAX_DURATION_SECONDS = 900;
const MODAL_APP_NAME = "avantiqo-audio-owned";
const MODAL_FUNCTION_NAME = "generate";
const MODAL_TRANSPORT = "modal-js-sdk-function-call-v1";

function text(value) { return String(value ?? "").trim(); }
function enabled(value) { return ["1","true","yes","on"].includes(text(value).toLowerCase()); }
function score(value, fallback) { const number=Number(value); return Number.isFinite(number) ? Math.max(0,Math.min(100,number)) : fallback; }
function configuredCapabilities(value) {
  const requested=text(value).split(",").map((item)=>item.trim()).filter(Boolean);
  const source=requested.length ? requested : ["ai.music.generate"];
  const unsupported=source.filter((item)=>!LOCAL_CAPABILITIES.includes(item));
  if (unsupported.length) throw new Error(`AVANTIQO_AUDIO_LOCAL_CAPABILITY_NOT_IMPLEMENTED:${unsupported.join(",")}`);
  return [...new Set(source)];
}

const localComputeConfigured=enabled(process.env.AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED);
const engineEnabled=enabled(process.env.AVANTIQO_AUDIO_ENGINE_ENABLED);
const capabilities=configuredCapabilities(process.env.AVANTIQO_AUDIO_CERTIFIED_CAPABILITIES);
const existing=PROVIDER_REGISTRY[PROVIDER_ID] || {};

PROVIDER_REGISTRY[PROVIDER_ID]={
  ...existing,
  id:PROVIDER_ID,
  name:"Avantiqo Music",
  category:"ai",
  connectionModel:"managed",
  capabilities,
  countries:["*"],
  currencies:["*"],
  runtime:"avantiqo_audio",
  runtimeAvailable:Boolean(engineEnabled && localComputeConfigured && capabilities.length),
  active:true,
  quality_score:score(process.env.AVANTIQO_AUDIO_ENGINE_QUALITY_SCORE,existing.quality_score ?? 90),
  speed_score:score(process.env.AVANTIQO_AUDIO_ENGINE_SPEED_SCORE,existing.speed_score ?? 76),
  reliability_score:score(process.env.AVANTIQO_AUDIO_ENGINE_RELIABILITY_SCORE,existing.reliability_score ?? 84),
  metadata:{
    ...(existing.metadata || {}),
    owned_by: "AVANTIQO",
    managed_by: "AVANTIQO",
    supplier_type: "OWNED_INFERENCE",
    infrastructure_provider: localMusicRuntimeAvailable ? "AVANTIQO_LOCAL_NODE_V1" : "MODAL_DIRECT_A10G_ASYNC_V1",
    infrastructure_candidates: localMusicRuntimeAvailable ? ["AVANTIQO_LOCAL_NODE_V1", "MODAL_DIRECT_A10G_ASYNC_V1"] : ["MODAL_DIRECT_A10G_ASYNC_V1"],
    modal_only_execution: false,
    local_first: localMusicRuntimeAvailable,
    modal_fallback: true,
    modal_fallback_only_when_local_unavailable_or_unsupported: true,
    node01_cost_avoidance_policy: "USE_LOCAL_WHEN_CERTIFIED_AND_HEALTHY",
    local_first_capabilities: [
      "ai.music.generate",
      "ai.audio.stems",
      "ai.audio.vocal-correct",
      "ai.audio.elastic-warp",
      "ai.sfx.generate",
    ],
    local_music_runtime: { model: "ACE-Step/Ace-Step1.5", runtime_variant: "acestep-v15-turbo", resource: "CPU_FLOAT32", use_lm: false, default_inference_steps: 8, proven_full_song_seconds: 210 },
    engine_contract: "AVANTIQO_AUDIO_ENGINE_V1",
    modal_transport: MODAL_TRANSPORT,
    modal_gateway_required: false,
    modal_app_name: MODAL_APP_NAME,
    modal_function_name: MODAL_FUNCTION_NAME,
    product_model: "avantiqo-music-v1",
    model_family: modelFamily,
    model_variant: modelVariant,
    quality_profile: QUALITY_PROFILE,
    benchmark_gate: true,
    owned_only_required: true,
    external_provider_fallback_allowed: false,
    provider_selection_exposed: false,
    raw_reasoning_persisted: false,
    ace_step_lm_enabled: lmEnabled,
    ace_step_lm_model: lmModel,
    ace_step_lm_backend: lmBackend,
    thinking_enabled: lmEnabled,
    prompt_serialization_boundary: "EXECUTION_TRANSPORT_ONLY",
    output_storage: "AVANTIQO_PRIVATE_CREATIVE_STORAGE",
    target_capabilities: TARGET_CAPABILITIES,
    sfx_runtime: {
      owner: "AVANTIQO", capability: SFX_CAPABILITY, product_model: SFX_PRODUCT_MODEL, foundation_model: SFX_FOUNDATION_MODEL, quality_profile: SFX_QUALITY_PROFILE, infrastructure_provider: "AVANTIQO_LOCAL_NODE_V1_PRIMARY_MODAL_FALLBACK", runtime_status: sfxRuntimeAvailable ? "CERTIFIED_CONFIGURED" : "CERTIFICATION_OR_CONFIGURATION_REQUIRED", production_routing_allowed: sfxRuntimeAvailable, certification_required: true, output_sample_rate_hz: 48000, maximum_duration_seconds: 30, endpoint_configured: false, local_cpu_runtime: "OPENMOSS_GGML_CPU_V1", local_first: true, local_batch_available: true, local_batch_execution_classes: ["background", "batch", "local_batch"], interactive_runtime: "MODAL_DIRECT_A10G_ASYNC_V1", modal_fallback: true, modal_fallback_only_when_local_unavailable: true, modal_direct_configured: modalConfigured, engine_enabled: sfxEngineEnabled, engine_certified: sfxEngineCertified, certification_evidence_fingerprint_configured: sfxCertificationEvidenceBound, certification_evidence_sha256: sfxCertificationEvidenceBound ? sfxCertificationEvidenceFingerprint : null, external_provider_fallback_allowed: false,
    },
    implemented_capabilities: [...IMPLEMENTED_CAPABILITIES, ...(sfxRuntimeAvailable ? [SFX_CAPABILITY] : [])],
    modal_main_capabilities: MODAL_MAIN_CAPABILITIES,
    certifiable_capabilities: CERTIFIABLE_CAPABILITIES,
    certified_capabilities: capabilities,
    default_certified_capabilities: DEFAULT_CERTIFIED_CAPABILITIES,
    benchmark_required_capabilities: CERTIFIABLE_CAPABILITIES.filter((capability) => !DEFAULT_CERTIFIED_CAPABILITIES.includes(capability)),
    base_model_required_capabilities: [],
    modal_worker_contract: {
      contract: "AVANTIQO_AUDIO_MODAL_A10G_V1",
      gpu: "A10G",
      max_gpu_containers: 1,
      scale_to_zero: true,
      persistent_model_volume: false,
      model_storage: "IMMUTABLE_MODAL_IMAGE_LAYER",
      image_digest: "sha256:fe148b123a7c8ce95c639a22abf8f0e918cba5f0e28f71bc4e3fe254c893b56b",
      model_bake_required_on_first_deploy: true,
      raw_reasoning_persisted: false,
    },
    temporal_extend_runtime: {
      capability: "ai.audio.extend", model_lane: EXPECTED_MODEL_VARIANT, task_type: "repaint", strategy: "XL_TURBO_REPAINT_RIGHT_OUTPAINT", source_duration_measured_by_worker: true, right_padding_outpaint_required: true, continuity_overlap_required: true, runtime_status: "IMPLEMENTED_MODAL_BENCHMARK_REQUIRED", modal_certification_candidate_available: true, production_routing_allowed: capabilities.includes("ai.audio.extend"), certification_required: true, human_review_required: true, temporal_extension_proven: false,
    },
    separator_capabilities: SEPARATOR_CAPABILITIES,
    separator_runtime: {
      owner: "AVANTIQO", capability: "ai.audio.stems", model: STEM_SEPARATOR_MODEL, model_lane: STEM_SEPARATOR_LANE, quality_profile: STEM_SEPARATOR_PROFILE, runtime_status: separatorRuntimeAvailable ? "CERTIFIED_CONFIGURED" : "CERTIFICATION_OR_CONFIGURATION_REQUIRED", production_routing_allowed: separatorRuntimeAvailable, certification_required: true, source_audio_required: true, source_audio_max_duration_seconds: SOURCE_AUDIO_MAX_DURATION_SECONDS, rights_attestation_required: true, rights_attestation_contract: SOURCE_AUDIO_RIGHTS_ATTESTATION_CONTRACT, content_restriction_policy: SOURCE_AUDIO_CONTENT_POLICY, stems: ["vocals", "drums", "bass", "other"], backing_track_stems: ["drums", "bass", "other"], source_timing_preserved_by_default: true,
      next_quality_candidate: { model: SEPARATOR_CANDIDATE_MODEL, status: "BENCHMARK_REQUIRED", production_routing_allowed: false, replace_certified_demucs_automatically: false },
    },
    vocal_role_separator_runtime: {
      owner: "AVANTIQO",
      capability: VOCAL_ROLE_SEPARATOR_CAPABILITY,
      contract: "AVANTIQO_MUSIC_VOCAL_ROLE_SEPARATION_V1",
      runtime_status: VOCAL_ROLE_SEPARATOR_STATUS,
      production_routing_allowed: false,
      certification_required: true,
      human_listening_review_required: true,
      supported_role_labels: ["LEAD", "BACKING", "HARMONY", "CHOIR", "ADLIB", "OTHER_VOCAL"],
      required_candidate_outputs: ["lead_vocal", "supporting_vocals", "instrumental"],
      preserve_backing_vocals_supported: true,
      remove_lead_vocal_only_supported: true,
      research_candidate_runtime: "AVANTIQO_LOCAL_NODE_V1",
      research_candidate_pipeline: ["DEMUCS_HTDEMUCS_FT_ALL_VOCALS", "UVR_MDXNET_KARA_2_SECOND_PASS"],
      stage2_model: VOCAL_ROLE_SEPARATOR_MODEL,
      quality_profile: VOCAL_ROLE_SEPARATOR_PROFILE,
      model_license_verified: true,
      model_license: VOCAL_ROLE_SEPARATOR_MODEL_LICENSE,
      model_sha256: VOCAL_ROLE_SEPARATOR_MODEL_SHA256,
      attribution_required: true,
      ordinary_stem_separator_substitution_forbidden: true,
      role_labels_may_not_be_inferred_from_track_name: true,
      benchmark_fixture_roles_declared_by_human: true,
      benchmark_must_prove: ["LEAD_REMOVAL_WITH_SUPPORTING_VOCALS_PRESERVED", "SUPPORTING_VOCAL_BLEED_WITHIN_REVIEW_THRESHOLD", "INSTRUMENTAL_BLEED_WITHIN_REVIEW_THRESHOLD", "SOURCE_TIMING_PRESERVED", "NO_ORDINARY_DEMUCS_FALLBACK"],
      candidate_models: [VOCAL_ROLE_SEPARATOR_MODEL, SEPARATOR_CANDIDATE_MODEL],
      replace_certified_demucs_automatically: false,
    },
    vocal_correction_runtime: {
      owner: "AVANTIQO", capability: VOCAL_CORRECTION_CAPABILITY, model: VOCAL_CORRECTION_MODEL, engine_contract: VOCAL_CORRECTION_ENGINE_CONTRACT, quality_profile: VOCAL_CORRECTION_QUALITY_PROFILE, runtime_status: vocalCorrectionRuntimeAvailable ? "CERTIFIED_CONFIGURED" : "CERTIFICATION_OR_CONFIGURATION_REQUIRED", production_routing_allowed: capabilities.includes(VOCAL_CORRECTION_CAPABILITY), certification_required: true, source_audio_required: true, isolated_vocal_only: true, musician_approved_plan_supported: true, timing_review_required_for_workstation: true, tone_preservation_compensation_configured: true, formant_preservation_claimed: false, rights_attestation_required: true, rights_attestation_contract: SOURCE_AUDIO_RIGHTS_ATTESTATION_CONTRACT, content_restriction_policy: SOURCE_AUDIO_CONTENT_POLICY, endpoint_configured: false, modal_direct_configured: modalConfigured, modal_app_name: "avantiqo-music-vocal-correction-owned", modal_function_name: "correct",
    },
    elastic_audio_runtime: {
      owner: "AVANTIQO", capability: ELASTIC_AUDIO_CAPABILITY, model: ELASTIC_AUDIO_MODEL, engine_contract: ELASTIC_AUDIO_ENGINE_CONTRACT, quality_profile: ELASTIC_AUDIO_QUALITY_PROFILE, runtime_status: elasticAudioRuntimeAvailable ? "CERTIFIED_CONFIGURED" : "CERTIFICATION_OR_CONFIGURATION_REQUIRED", production_routing_allowed: capabilities.includes(ELASTIC_AUDIO_CAPABILITY), certification_required: true, human_listening_review_required: true, musician_approved_warp_plan_required: true, automatic_apply_forbidden: true, pitch_preserving_time_stretch: true, transient_preservation_required: true, source_audio_max_duration_seconds: SOURCE_AUDIO_MAX_DURATION_SECONDS, endpoint_configured: false, modal_direct_configured: modalConfigured, modal_app_name: "avantiqo-music-elastic-owned", modal_function_name: "render",
    },
    configured_foundation_model: foundationModel || null,
    foundation_models: [
      ...(foundationModel ? [foundationModel] : []),
      STEM_SEPARATOR_MODEL,
      VOCAL_CORRECTION_MODEL,
      ELASTIC_AUDIO_MODEL,
    ],
    runtime_configuration:{
      enabled:engineEnabled,
      local_compute_configured:localComputeConfigured,
      local_only:true,
      modal_fallback_allowed:false,
      transport:"supabase-pull-queue-v1",
      queue_endpoint:true,
      scale_to_zero:false,
    },
  },
};

export const AVANTIQO_AUDIO_PROVIDER_ID=PROVIDER_ID;
