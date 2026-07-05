import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "microsoft-365",
  name: "Microsoft 365",
  type: PROVIDER_TYPES.COMMUNICATION,
  authentication: "oauth2",
  billing_units: [
  "api_call"
],
  capabilities: [
  "PRODUCTIVITY",
  "EMAIL",
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
      `Microsoft 365 provider '${capability}' not implemented`
    );
  },
});
