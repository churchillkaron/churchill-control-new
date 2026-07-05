import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "flux",
  name: "Flux",
  type: PROVIDER_TYPES.AI,
  authentication: "api_key",
  billing_units: [
  "image"
],
  capabilities: [
  "IMAGE_AI"
],
  industries: ["all"],
  regions: ["global"],
  models: [],
  pricing: {},
  limits: {},
  metadata: {},

  async execute({ capability }) {
    throw new Error(
      `Flux provider '${capability}' not implemented`
    );
  },
});
