import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "tripadvisor",
  name: "Tripadvisor",
  type: PROVIDER_TYPES.MARKETING,
  authentication: "oauth2",
  billing_units: [
  "api_call"
],
  capabilities: [
  "TRIPADVISOR"
],
  industries: ["all"],
  regions: ["global"],
  models: [],
  pricing: {},
  limits: {},
  metadata: {},

  async execute({ capability }) {
    throw new Error(
      `Tripadvisor provider '${capability}' not implemented`
    );
  },
});
