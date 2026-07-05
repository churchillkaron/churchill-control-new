import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "meta",
  name: "Meta",
  type: PROVIDER_TYPES.MARKETING,
  authentication: "oauth2",
  billing_units: [
  "api_call",
  "message"
],
  capabilities: [
  "FACEBOOK",
  "INSTAGRAM",
  "WHATSAPP"
],
  industries: ["all"],
  regions: ["global"],
  models: [],
  pricing: {},
  limits: {},
  metadata: {},

  async execute({ capability }) {
    throw new Error(
      `Meta provider '${capability}' not implemented`
    );
  },
});
