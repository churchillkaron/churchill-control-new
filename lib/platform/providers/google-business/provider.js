import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "google-business",
  name: "Google Business",
  type: PROVIDER_TYPES.MARKETING,
  authentication: "oauth2",
  billing_units: [
  "api_call"
],
  capabilities: [
  "GOOGLE_BUSINESS"
],
  industries: ["all"],
  regions: ["global"],
  models: [],
  pricing: {},
  limits: {},
  metadata: {},

  async execute({ capability }) {
    throw new Error(
      `Google Business provider '${capability}' not implemented`
    );
  },
});
