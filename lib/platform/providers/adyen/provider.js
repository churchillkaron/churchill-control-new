import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "adyen",
  name: "Adyen",
  type: PROVIDER_TYPES.PAYMENT,
  authentication: "api_key",
  billing_units: [
  "transaction"
],
  capabilities: [
  "CARD_PAYMENTS"
],
  industries: ["all"],
  regions: ["global"],
  models: [],
  pricing: {},
  limits: {},
  metadata: {},

  async execute({ capability }) {
    throw new Error(
      `Adyen provider '${capability}' not implemented`
    );
  },
});
