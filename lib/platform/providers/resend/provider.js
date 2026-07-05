import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "resend",
  name: "Resend",
  type: PROVIDER_TYPES.COMMUNICATION,
  authentication: "api_key",
  billing_units: [
  "message"
],
  capabilities: [
  "EMAIL"
],
  industries: ["all"],
  regions: ["global"],
  models: [],
  pricing: {},
  limits: {},
  metadata: {},

  async execute({ capability }) {
    throw new Error(
      `Resend provider '${capability}' not implemented`
    );
  },
});
