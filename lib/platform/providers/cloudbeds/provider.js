import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "cloudbeds",
  name: "Cloudbeds",
  type: PROVIDER_TYPES.OTHER,
  authentication: "oauth2",
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
      `Cloudbeds provider '${capability}' not implemented`
    );
  },
});
