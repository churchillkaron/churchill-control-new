import {
  PROVIDER_REGISTRY,
} from "@/lib/platform/service-runtime/providers/ProviderRegistry";

export const FAL_PROVIDER_ID = "fal";
export const GROK_PROVIDER_ID = "grok";
export const SEEDANCE_PROVIDER_ID = "seedance";
export const VEO_PROVIDER_ID = "veo";

const existingFal = PROVIDER_REGISTRY[FAL_PROVIDER_ID] || {};

PROVIDER_REGISTRY[FAL_PROVIDER_ID] = {
  ...existingFal,
  id: FAL_PROVIDER_ID,
  name: "fal",
  category: "ai",
  connectionModel: "managed",
  capabilities: [
    ...new Set([
      ...(existingFal.capabilities || []),
      "ai.music.generate",
      "ai.sfx.generate",
    ]),
  ],
  countries: ["*"],
  currencies: ["*"],
  runtime: "fal",
  runtimeAvailable: true,
  active: true,
  quality_score: existingFal.quality_score ?? 82,
  speed_score: existingFal.speed_score ?? 88,
  reliability_score: existingFal.reliability_score ?? 86,
  metadata: {
    ...(existingFal.metadata || {}),
    transport: "FAL_QUEUE_V1",
    credential_environment_variable: "FAL_KEY",
    prompt_serialization_boundary: "EXECUTION_TRANSPORT_ONLY",
    supported_models: [
      ...new Set([
        ...(existingFal.metadata?.supported_models || []),
        "fal-ai/ace-step/prompt-to-audio",
        "fal-ai/mmaudio-v2/text-to-audio",
      ]),
    ],
  },
};

const existingGrok = PROVIDER_REGISTRY[GROK_PROVIDER_ID] || {};

PROVIDER_REGISTRY[GROK_PROVIDER_ID] = {
  ...existingGrok,
  id: GROK_PROVIDER_ID,
  name: "Grok Imagine Video",
  category: "ai",
  connectionModel: "managed",
  capabilities: [
    "ai.video.generate",
  ],
  countries: ["*"],
  currencies: ["*"],
  runtime: "grok",
  runtimeAvailable: true,
  active: true,
  quality_score: existingGrok.quality_score ?? 90,
  speed_score: existingGrok.speed_score ?? 80,
  reliability_score: existingGrok.reliability_score ?? 86,
  metadata: {
    ...(existingGrok.metadata || {}),
    transport: "FAL_QUEUE_V1",
    canonical_supplier_provider: "fal",
    credential_environment_variable: "FAL_KEY",
    prompt_serialization_boundary: "EXECUTION_TRANSPORT_ONLY",
    native_audio: true,
    supported_models: [
      "xai/grok-imagine-video/text-to-video",
      "xai/grok-imagine-video/image-to-video",
    ],
  },
};

const existingSeedance = PROVIDER_REGISTRY[SEEDANCE_PROVIDER_ID] || {};

PROVIDER_REGISTRY[SEEDANCE_PROVIDER_ID] = {
  ...existingSeedance,
  id: SEEDANCE_PROVIDER_ID,
  name: "Seedance",
  category: "ai",
  connectionModel: "managed",
  capabilities: [
    "ai.video.generate",
  ],
  countries: ["*"],
  currencies: ["*"],
  runtime: "seedance",
  runtimeAvailable: true,
  active: true,
  quality_score: existingSeedance.quality_score ?? 91,
  speed_score: existingSeedance.speed_score ?? 84,
  reliability_score: existingSeedance.reliability_score ?? 86,
  metadata: {
    ...(existingSeedance.metadata || {}),
    transport: "FAL_QUEUE_V1",
    canonical_supplier_provider: "fal",
    credential_environment_variable: "FAL_KEY",
    prompt_serialization_boundary: "EXECUTION_TRANSPORT_ONLY",
    native_audio: false,
    supported_models: [
      "bytedance/seedance-2.0/fast/text-to-video",
      "bytedance/seedance-2.0/fast/image-to-video",
    ],
  },
};

const existingVeo = PROVIDER_REGISTRY[VEO_PROVIDER_ID] || {};

PROVIDER_REGISTRY[VEO_PROVIDER_ID] = {
  ...existingVeo,
  id: VEO_PROVIDER_ID,
  name: "Google Veo 3.1 Fast via fal",
  category: "ai",
  connectionModel: "managed",
  capabilities: [
    "ai.video.generate",
  ],
  countries: ["*"],
  currencies: ["*"],
  runtime: "veo",
  runtimeAvailable: true,
  active: true,
  quality_score: existingVeo.quality_score ?? 94,
  speed_score: existingVeo.speed_score ?? 86,
  reliability_score: existingVeo.reliability_score ?? 90,
  metadata: {
    ...(existingVeo.metadata || {}),
    transport: "FAL_QUEUE_V1",
    canonical_supplier_provider: "fal",
    credential_environment_variable: "FAL_KEY",
    prompt_serialization_boundary: "EXECUTION_TRANSPORT_ONLY",
    native_audio: true,
    supported_models: [
      "fal-ai/veo3.1/fast",
      "fal-ai/veo3.1/fast/image-to-video",
    ],
  },
};
