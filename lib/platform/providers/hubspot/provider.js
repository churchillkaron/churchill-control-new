import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "hubspot",
  name: "HubSpot",
  type: PROVIDER_TYPES.OTHER,
  authentication: "oauth2",
  billing_units: [
  "api_call"
],
  capabilities: [
  "CRM_SYNC"
],
  industries: ["all"],
  regions: ["global"],
  models: [],
  pricing: {},
  limits: {},
  metadata: {},

  async execute({ capability }) {
    throw new Error(
      `HubSpot provider '${capability}' not implemented`
    );
  },
});
