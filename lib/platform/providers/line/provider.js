import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "line",
  name: "LINE",
  type: PROVIDER_TYPES.COMMUNICATION,
  authentication: "oauth2",
  billing_units: [
  "message"
],
  capabilities: [
  "LINE"
],
  industries: ["all"],
  regions: ["global"],
  models: [],
  pricing: {},
  limits: {},
  metadata: {},

  async execute({ capability }) {
    throw new Error(
      `LINE provider '${capability}' not implemented`
    );
  },
});
