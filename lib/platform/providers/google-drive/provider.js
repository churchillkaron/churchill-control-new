import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "google-drive",
  name: "Google Drive",
  type: PROVIDER_TYPES.STORAGE,
  authentication: "oauth2",
  billing_units: [
  "gb"
],
  capabilities: [
  "STORAGE",
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
      `Google Drive provider '${capability}' not implemented`
    );
  },
});
