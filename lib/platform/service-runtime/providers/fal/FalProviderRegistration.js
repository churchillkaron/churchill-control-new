import {
  PROVIDER_REGISTRY,
} from "@/lib/platform/service-runtime/providers/ProviderRegistry";

const PROVIDER_ID = "fal";

if (!PROVIDER_REGISTRY[PROVIDER_ID]) {
  PROVIDER_REGISTRY[PROVIDER_ID] = {
    id: PROVIDER_ID,
    name: "fal",
    category: "ai",
    connectionModel: "managed",
    capabilities: [
      "ai.music.generate",
    ],
    countries: ["*"],
    currencies: ["*"],
    runtime: "fal",
    runtimeAvailable: true,
    active: true,
    quality_score: 82,
    speed_score: 88,
    reliability_score: 86,
    metadata: {
      transport: "FAL_QUEUE_V1",
      credential_environment_variable: "FAL_KEY",
      prompt_serialization_boundary: "EXECUTION_TRANSPORT_ONLY",
      supported_models: [
        "fal-ai/ace-step/prompt-to-audio",
      ],
    },
  };
}

export const FAL_PROVIDER_ID = PROVIDER_ID;
