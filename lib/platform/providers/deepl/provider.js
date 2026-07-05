import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "deepl",
  name: "DeepL",
  type: PROVIDER_TYPES.AI,
  authentication: "api_key",
  billing_units: [
  "character"
],
  capabilities: [
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
      `DeepL provider '${capability}' not implemented`
    );
  },
});
