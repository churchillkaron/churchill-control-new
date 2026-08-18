import {
  PROVIDER_REGISTRY,
} from "@/lib/platform/service-runtime/providers/ProviderRegistry";

const PROVIDER_ID = "google-veo";
const existing = PROVIDER_REGISTRY[PROVIDER_ID] || {};

PROVIDER_REGISTRY[PROVIDER_ID] = {
  ...existing,
  id: PROVIDER_ID,
  name: "Google Veo",
  category: "ai",
  connectionModel: "managed",
  capabilities: [],
  countries: ["*"],
  currencies: ["*"],
  runtime: "google_veo",
  runtimeAvailable: true,
  active: true,
  metadata: {
    ...(existing.metadata || {}),
    transport: "GEMINI_VEO_PREDICT_LONG_RUNNING_V1BETA",
    managed_by: "AVANTIQO",
    canonical_supplier_provider: "google",
    credential_source_provider: "gemini",
    prompt_serialization_boundary: "EXECUTION_TRANSPORT_ONLY",
    output_storage: "AVANTIQO_PRIVATE_CREATIVE_STORAGE",
  },
};

export const GOOGLE_VEO_PROVIDER_ID = PROVIDER_ID;
