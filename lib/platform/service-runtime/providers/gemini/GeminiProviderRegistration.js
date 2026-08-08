import {
  PROVIDER_REGISTRY,
} from "@/lib/platform/service-runtime/providers/ProviderRegistry";

const PROVIDER_ID = "gemini";
const existing = PROVIDER_REGISTRY[PROVIDER_ID] || {};

PROVIDER_REGISTRY[PROVIDER_ID] = {
  ...existing,
  id: PROVIDER_ID,
  name: "Gemini",
  category: "ai",
  connectionModel: "managed",
  capabilities: [
    "ai.video.generate",
  ],
  countries: ["*"],
  currencies: ["*"],
  runtime: "gemini",
  runtimeAvailable: true,
  active: true,
  metadata: {
    ...(existing.metadata || {}),
    transport: "GEMINI_INTERACTIONS_API_V1BETA",
    managed_by: "AVANTIQO",
    prompt_serialization_boundary: "EXECUTION_TRANSPORT_ONLY",
    output_storage: "AVANTIQO_PRIVATE_CREATIVE_STORAGE",
    native_audio: true,
    supported_models: [
      "gemini-omni-flash-preview",
    ],
  },
};

export const GEMINI_PROVIDER_ID = PROVIDER_ID;
