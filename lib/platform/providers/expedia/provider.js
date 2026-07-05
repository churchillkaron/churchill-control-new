import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "expedia",
  name: "Expedia",
  type: PROVIDER_TYPES.OTHER,
  authentication: "partner",
  billing_units: [
  "booking"
],
  capabilities: [
  "BOOKING"
],
  industries: ["all"],
  regions: ["global"],
  models: [],
  pricing: {},
  limits: {},
  metadata: {},

  async execute({ capability }) {
    throw new Error(
      `Expedia provider '${capability}' not implemented`
    );
  },
});
