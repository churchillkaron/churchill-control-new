import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "paypal",
  name: "PayPal",
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
      `PayPal provider '${capability}' not implemented`
    );
  },
});
