import {
  PROVIDER_REGISTRY,
} from "@/lib/platform/service-runtime/providers/ProviderRegistry";

const PROVIDER_ID = "google-veo";
const existing = PROVIDER_REGISTRY[PROVIDER_ID] || {};

PROVIDER_REGISTRY[PROVIDER_ID] = {
  ...existing,
  id: PROVIDER_ID,
  name: "Google Veo 3.1 Direct",
  category: "ai",
  connectionModel: "managed",
  capabilities: [
    "ai.video.generate",
  ],
  countries: ["*"],
  currencies: ["*"],
  runtime: "google_veo",
  runtimeAvailable: true,
  active: true,
  quality_score: existing.quality_score ?? 96,
  speed_score: existing.speed_score ?? 82,
  reliability_score: existing.reliability_score ?? 90,
  metadata: {
    ...(existing.metadata || {}),
    transport: "GEMINI_VEO_PREDICT_LONG_RUNNING_V1BETA",
    managed_by: "AVANTIQO",
    canonical_supplier_provider: "google",
    credential_source_provider: "gemini",
    prompt_serialization_boundary: "EXECUTION_TRANSPORT_ONLY",
    output_storage: "AVANTIQO_PRIVATE_CREATIVE_STORAGE",
    native_audio: true,
    precision_runtime: true,
    precision_controls: {
      first_frame: true,
      last_frame: true,
      reference_images: true,
      max_reference_images: 3,
      video_extension: true,
    },
    supported_models: [
      "veo-3.1-generate-preview",
    ],
  },
};

export const GOOGLE_VEO_PROVIDER_ID = PROVIDER_ID;
