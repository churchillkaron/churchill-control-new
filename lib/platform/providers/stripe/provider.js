import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "stripe",
  name: "Stripe",
  type: PROVIDER_TYPES.PAYMENT,
  authentication: "oauth2",
  billing_units: [
  "transaction"
],
  capabilities: [
  "CARD_PAYMENTS",
  "PAYMENT_LINKS"
],
  industries: ["all"],
  regions: ["global"],
  models: [],
  pricing: {},
  limits: {},
  metadata: {},

  async execute({ capability }) {
    throw new Error(
      `Stripe provider '${capability}' not implemented`
    );
  },
});
