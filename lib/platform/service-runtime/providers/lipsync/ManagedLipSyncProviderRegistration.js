import {
  PROVIDER_REGISTRY,
} from "@/lib/platform/service-runtime/providers/ProviderRegistry";

const PROVIDER_ID = "managed_lipsync";

if (!PROVIDER_REGISTRY[PROVIDER_ID]) {
  PROVIDER_REGISTRY[PROVIDER_ID] = {
    id: PROVIDER_ID,
    name: "Avantiqo Managed Lip Sync",
    category: "ai",
    connectionModel: "managed",
    capabilities: [
      "ai.video.lip_sync",
      "ai.video.lip_sync.validate",
    ],
    countries: ["*"],
    currencies: ["*"],
    runtime: "managed_lipsync",
    runtimeAvailable: true,
    active: true,
  };
}

export const MANAGED_LIPSYNC_PROVIDER_ID = PROVIDER_ID;
