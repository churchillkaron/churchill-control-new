import {
  isAvantiqoOwnedProvider,
} from "./AvantiqoOwnedProviderPolicy.js";

const PRODUCTION_PRICING_STATUS = "PRODUCTION_CERTIFIED";
const MEDIA_CERTIFICATION_EVIDENCE_CONTRACT =
  "AVANTIQO_OWNED_MEDIA_CERTIFICATION_EVIDENCE_V1";

export const AVANTIQO_OWNED_MODEL_CATALOG = Object.freeze({
  "avantiqo-intelligence": Object.freeze({
    models: Object.freeze({
      "Qwen/Qwen3-30B-A3B-Thinking-2507": Object.freeze({
        license: "apache-2.0",
        license_verified: true,
        source: "https://huggingface.co/Qwen/Qwen3-30B-A3B-Thinking-2507",
        runtime_compatible: true,
        capabilities: Object.freeze([
          "ai.reasoning.execute",
          "ai.text.generate",
        ]),
      }),
    }),
  }),
  "avantiqo-image": Object.freeze({
    models: Object.freeze({
      "Qwen/Qwen-Image": Object.freeze({
        license: "apache-2.0",
        license_verified: true,
        source: "https://huggingface.co/Qwen/Qwen-Image",
        runtime_compatible: true,
        capabilities: Object.freeze(["ai.image.generate"]),
      }),
      "Qwen/Qwen-Image-Edit": Object.freeze({
        license: "apache-2.0",
        license_verified: true,
        source: "https://huggingface.co/Qwen/Qwen-Image-Edit",
        runtime_compatible: true,
        capabilities: Object.freeze(["ai.image.edit"]),
      }),
      "Qwen/Qwen-Image-Edit-2511": Object.freeze({
        license: "apache-2.0",
        license_verified: true,
        source: "https://huggingface.co/Qwen/Qwen-Image-Edit-2511",
        runtime_compatible: true,
        capabilities: Object.freeze([
          "ai.image.inpaint",
          "ai.image.outpaint",
        ]),
      }),
      "caidas/swin2SR-realworld-sr-x4-64-bsrgan-psnr": Object.freeze({
        license: "apache-2.0",
        license_verified: true,
        source: "https://huggingface.co/caidas/swin2SR-realworld-sr-x4-64-bsrgan-psnr",
        runtime_compatible: true,
        capabilities: Object.freeze(["ai.image.upscale"]),
      }),
      "Qwen/Qwen2.5-VL-7B-Instruct": Object.freeze({
        license: "apache-2.0",
        license_verified: true,
        source: "https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct",
        runtime_compatible: true,
        capabilities: Object.freeze(["ai.image.analyze"]),
      }),
    }),
  }),
  "avantiqo-video": Object.freeze({
    models: Object.freeze({
      "Wan-AI/Wan2.2-T2V-A14B-Diffusers": Object.freeze({
        license: "apache-2.0",
        license_verified: true,
        source: "https://huggingface.co/Wan-AI/Wan2.2-T2V-A14B-Diffusers",
        runtime_compatible: true,
        capabilities: Object.freeze(["ai.video.generate"]),
      }),
      "Wan-AI/Wan2.2-I2V-A14B-Diffusers": Object.freeze({
        license: "apache-2.0",
        license_verified: true,
        source: "https://huggingface.co/Wan-AI/Wan2.2-I2V-A14B-Diffusers",
        runtime_compatible: true,
        capabilities: Object.freeze([
          "ai.video.image_to_video",
          "ai.video.extend",
        ]),
      }),
      "Wan-AI/Wan2.1-FLF2V-14B-720P-diffusers": Object.freeze({
        license: "apache-2.0",
        license_verified: true,
        source: "https://huggingface.co/Wan-AI/Wan2.1-FLF2V-14B-720P-diffusers",
        runtime_compatible: true,
        capabilities: Object.freeze(["ai.video.first_last_frame_to_video"]),
      }),
      "Wan-AI/Wan2.1-VACE-14B-diffusers": Object.freeze({
        license: "apache-2.0",
        license_verified: true,
        source: "https://huggingface.co/Wan-AI/Wan2.1-VACE-14B-diffusers",
        runtime_compatible: true,
        capabilities: Object.freeze([
          "ai.video.video_to_video",
          "ai.video.edit",
          "ai.video.inpaint",
        ]),
      }),
      "caidas/swin2SR-realworld-sr-x4-64-bsrgan-psnr": Object.freeze({
        license: "apache-2.0",
        license_verified: true,
        source: "https://huggingface.co/caidas/swin2SR-realworld-sr-x4-64-bsrgan-psnr",
        runtime_compatible: true,
        capabilities: Object.freeze(["ai.video.upscale"]),
      }),
      "ByteDance/LatentSync-1.6": Object.freeze({
        license: "apache-2.0",
        license_verified: true,
        source: "https://github.com/bytedance/LatentSync",
        runtime_compatible: true,
        pinned_upstream_commit: "a229c3948406bc2cf6eaf4873e662e70c6a04746",
        capabilities: Object.freeze(["ai.video.lipsync"]),
      }),
    }),
  }),
  "avantiqo-audio": Object.freeze({
    models: Object.freeze({
      "ACE-Step/Ace-Step1.5": Object.freeze({
        license: "mit",
        license_verified: true,
        source: "https://huggingface.co/ACE-Step/Ace-Step1.5",
        runtime_compatible: true,
        runtime_family: "ACE_STEP_1_5",
        runtime_variant: "acestep-v15-xl-turbo",
        quality_profile: "ACE_STEP_1_5_XL_TURBO_1_7B_LM_V1",
        capabilities: Object.freeze(["ai.music.generate"]),
        ace_step_lm_enabled: true,
        ace_step_lm_model: "acestep-5Hz-lm-1.7B",
        ace_step_lm_backend: "vllm",
        thinking_enabled: true,
        raw_reasoning_persisted: false,
      }),
    }),
  }),
  "avantiqo-voice": Object.freeze({
    models: Object.freeze({
      "openai/whisper-large-v3-turbo": Object.freeze({
        license: "mit",
        license_verified: true,
        source: "https://github.com/openai/whisper",
        runtime_compatible: true,
        capabilities: Object.freeze(["ai.speech.to.text"]),
      }),
      "resemble-ai/chatterbox:multilingual-v3": Object.freeze({
        license: "mit",
        license_verified: true,
        source: "https://github.com/resemble-ai/chatterbox",
        runtime_compatible: true,
        capabilities: Object.freeze(["ai.text.to.speech"]),
        supported_languages: Object.freeze([
          "ar", "da", "de", "el", "en", "es", "fi", "fr", "he", "hi", "it",
          "ja", "ko", "ms", "nl", "no", "pl", "pt", "ru", "sv", "sw", "tr", "zh",
        ]),
        voice_cloning_certified: false,
        watermarking: "CHATTERBOX_PERTH_BUILT_IN",
      }),
    }),
  }),
  "avantiqo-code": Object.freeze({
    models: Object.freeze({
      "Qwen/Qwen3-Coder-30B-A3B-Instruct": Object.freeze({
        license: "apache-2.0",
        license_verified: true,
        source: "https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct",
        runtime_compatible: true,
        capabilities: Object.freeze([
          "ai.code.generate",
          "ai.code.edit",
          "ai.code.refactor",
          "ai.code.review",
          "ai.code.debug",
        ]),
      }),
    }),
  }),
});

function text(value) {
  return String(value ?? "").trim();
}

function metadata(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function configuredFoundationModels(provider = {}) {
  const details = metadata(provider.metadata);
  return [
    details.configured_foundation_model,
    details.configured_model,
    ...(Array.isArray(details.foundation_models) ? details.foundation_models : []),
  ]
    .map(text)
    .filter(Boolean);
}

function isOwnedMediaCapability(capability) {
  const requested = text(capability).toLowerCase();
  return requested.startsWith("ai.image.") ||
    requested.startsWith("ai.video.") ||
    requested.startsWith("ai.audio.") ||
    requested === "ai.music.generate";
}

export function ownedModelCertification({ provider, capability } = {}) {
  const providerId = text(provider?.id || provider);
  if (!isAvantiqoOwnedProvider(providerId)) {
    return {
      required: false,
      eligible: true,
      provider: providerId || null,
      capability: text(capability) || null,
      reason: null,
    };
  }

  const catalog = AVANTIQO_OWNED_MODEL_CATALOG[providerId];
  const configured = configuredFoundationModels(
    typeof provider === "object" ? provider : {},
  );
  const requestedCapability = text(capability);
  const matching = configured
    .map((model) => ({ model, certification: catalog?.models?.[model] || null }))
    .filter(({ certification }) =>
      certification?.license_verified === true &&
      certification?.runtime_compatible === true &&
      certification.capabilities.includes(requestedCapability),
    );

  return {
    required: true,
    eligible: matching.length > 0,
    provider: providerId,
    capability: requestedCapability || null,
    configured_models: configured,
    approved_models: matching.map(({ model }) => model),
    license_verified: matching.length > 0,
    runtime_compatible: matching.length > 0,
    reason: matching.length
      ? null
      : configured.length
        ? "OWNED_FOUNDATION_MODEL_NOT_APPROVED_FOR_CAPABILITY"
        : "OWNED_FOUNDATION_MODEL_NOT_CONFIGURED",
  };
}

export function ownedPricingCertification({ provider, capability, pricing } = {}) {
  const providerId = text(provider?.id || provider || pricing?.provider);
  if (!isAvantiqoOwnedProvider(providerId)) {
    return {
      required: false,
      eligible: true,
      provider: providerId || null,
      reason: null,
    };
  }

  const details = metadata(pricing?.metadata);
  const status = text(details.pricing_status).toUpperCase();
  const requestedCapability = text(capability || pricing?.capability);
  const pricingModel = text(pricing?.model);
  const mediaRequired = isOwnedMediaCapability(requestedCapability);
  const certifiedCapability = text(details.certified_capability);
  const certifiedModel = text(details.certified_model);
  const evidenceContract = text(details.human_quality_evidence_contract);
  const reviewedAt = text(details.human_quality_reviewed_at);
  const reviewer = text(details.human_quality_reviewer);

  const checks = {
    pricing_status: status === PRODUCTION_PRICING_STATUS,
    owned_inference: details.owned_inference === true,
    benchmark_certified: details.benchmark_certified === true,
    economics_certified: details.economics_certified === true,
    model_license_verified: details.model_license_verified === true,
    recalibration_clear: details.recalibration_required !== true,
    ...(mediaRequired
      ? {
          human_quality_certified: details.human_quality_certified === true,
          human_quality_evidence_contract:
            evidenceContract === MEDIA_CERTIFICATION_EVIDENCE_CONTRACT,
          certified_capability_bound:
            Boolean(requestedCapability) && certifiedCapability === requestedCapability,
          certified_model_bound:
            Boolean(pricingModel) && certifiedModel === pricingModel,
          human_quality_reviewer: Boolean(reviewer),
          human_quality_reviewed_at:
            Boolean(reviewedAt) && Number.isFinite(Date.parse(reviewedAt)),
        }
      : {}),
  };
  const failed = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);

  return {
    required: true,
    eligible: failed.length === 0,
    provider: providerId,
    pricing_id: pricing?.id || null,
    pricing_status: status || null,
    capability: requestedCapability || null,
    model: pricingModel || null,
    media_human_quality_required: mediaRequired,
    human_quality_evidence_contract: evidenceContract || null,
    certified_capability: certifiedCapability || null,
    certified_model: certifiedModel || null,
    checks,
    failed_checks: failed,
    reason: failed.length ? `OWNED_PRICING_NOT_CERTIFIED:${failed.join(",")}` : null,
  };
}

export function ownedExecutionCertification({
  provider,
  capability,
  pricing,
} = {}) {
  const model = ownedModelCertification({ provider, capability });
  const economics = ownedPricingCertification({ provider, capability, pricing });
  return {
    contract: "AVANTIQO_OWNED_EXECUTION_CERTIFICATION_V1",
    eligible: model.eligible && economics.eligible,
    model,
    economics,
    reason: model.reason || economics.reason || null,
  };
}

export const AVANTIQO_OWNED_PRODUCTION_PRICING_STATUS = PRODUCTION_PRICING_STATUS;
export const AVANTIQO_OWNED_MEDIA_CERTIFICATION_EVIDENCE_CONTRACT =
  MEDIA_CERTIFICATION_EVIDENCE_CONTRACT;
