import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "siteminder",
  name: "SiteMinder",
  type: PROVIDER_TYPES.OTHER,
  authentication: "api_key",
  billing_units: [
  "api_call"
],
  capabilities: [
  "CHANNEL_MANAGER",
  "BOOKING"
],
  industries: ["all"],
  regions: ["global"],
  models: [],
  pricing: {},
  limits: {},
  metadata: {},

  async execute({ capability }) {
    throw new Error(
      `SiteMinder provider '${capability}' not implemented`
    );
  },
});
