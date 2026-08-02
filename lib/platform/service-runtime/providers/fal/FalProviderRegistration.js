import {
  PROVIDER_REGISTRY,
} from "@/lib/platform/service-runtime/providers/ProviderRegistry";

const PROVIDER_ID = "fal";

if (!PROVIDER_REGISTRY[PROVIDER_ID]) {
  PROVIDER_REGISTRY[PROVIDER_ID] = {
    id: PROVIDER_ID,
    name: "FAL",
    category: "ai",
    connectionModel: "managed",
    capabilities: [
      "ai.image.generate",
      "ai.image.edit",
      "ai.image.upscale",
      "ai.video.generate",
      "ai.video.image_to_video",
      "ai.music.generate",
      "ai.sfx.generate",
    ],
    countries: ["*"],
    currencies: ["*"],
    runtime: "fal",
    runtimeAvailable: true,
    active: true,
    metadata: {
      queue_runtime: true,
      model_selected_from_pricing: true,
      managed_credentials_required: true,
    },
  };
}

export const FAL_PROVIDER_ID = PROVIDER_ID;
