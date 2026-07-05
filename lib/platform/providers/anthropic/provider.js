import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "anthropic",
  name: "Anthropic",
  type: PROVIDER_TYPES.AI,
  authentication: "api_key",
  billing_units: [
  "token"
],
  capabilities: [
  "TEXT_AI",
  "TRANSLATION"
],
  industries: ["all"],
  regions: ["global"],
  models: [],
  pricing: {},
  limits: {},
  metadata: {},

  async execute({ capability }) {
    throw new Error(
      `Anthropic provider '${capability}' not implemented`
    );
  },
});
