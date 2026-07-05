import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "avantiqo-webhooks",
  name: "Avantiqo Webhooks",
  type: PROVIDER_TYPES.OTHER,
  authentication: "platform_managed",
  billing_units: [
  "api_call"
],
  capabilities: [
  "WEBHOOKS"
],
  industries: ["all"],
  regions: ["global"],
  models: [],
  pricing: {},
  limits: {},
  metadata: {},

  async execute({ capability }) {
    throw new Error(
      `Avantiqo Webhooks provider '${capability}' not implemented`
    );
  },
});
