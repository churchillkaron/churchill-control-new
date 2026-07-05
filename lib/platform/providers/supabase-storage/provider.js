import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "supabase-storage",
  name: "Supabase Storage",
  type: PROVIDER_TYPES.STORAGE,
  authentication: "platform_managed",
  billing_units: [
  "gb"
],
  capabilities: [
  "STORAGE"
],
  industries: ["all"],
  regions: ["global"],
  models: [],
  pricing: {},
  limits: {},
  metadata: {},

  async execute({ capability }) {
    throw new Error(
      `Supabase Storage provider '${capability}' not implemented`
    );
  },
});
