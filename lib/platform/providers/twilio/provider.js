import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "twilio",
  name: "Twilio",
  type: PROVIDER_TYPES.COMMUNICATION,
  authentication: "api_key",
  billing_units: [
  "message"
],
  capabilities: [
  "SMS",
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
      `Twilio provider '${capability}' not implemented`
    );
  },
});
