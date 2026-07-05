import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "imagen",
  name: "Imagen",
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
      `Imagen provider '${capability}' not implemented`
    );
  },
});
