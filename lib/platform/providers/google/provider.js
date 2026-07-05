import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "google",
  name: "Google",
  type: PROVIDER_TYPES.OTHER,
  authentication: "oauth2",
  billing_units: [
  "api_call"
],
  capabilities: [
  "SSO",
  "STORAGE",
  "PRODUCTIVITY",
  "GOOGLE_BUSINESS",
  "TRANSLATION",
  "OCR"
],
  industries: ["all"],
  regions: ["global"],
  models: [],
  pricing: {},
  limits: {},
  metadata: {},

  async execute({ capability }) {
    throw new Error(
      `Google provider '${capability}' not implemented`
    );
  },
});
