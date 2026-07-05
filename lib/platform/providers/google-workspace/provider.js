import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "google-workspace",
  name: "Google Workspace",
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
      `Google Workspace provider '${capability}' not implemented`
    );
  },
});
