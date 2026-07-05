import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "gmail",
  name: "Gmail",
  type: PROVIDER_TYPES.COMMUNICATION,
  authentication: "oauth2",
  billing_units: [
  "message"
],
  capabilities: [
  "EMAIL",
  "PRODUCTIVITY"
],
  industries: ["all"],
  regions: ["global"],
  models: [],
  pricing: {},
  limits: {},
  metadata: {},

  async execute({ capability }) {
    throw new Error(
      `Gmail provider '${capability}' not implemented`
    );
  },
});
