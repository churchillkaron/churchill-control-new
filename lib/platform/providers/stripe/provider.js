import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "stripe",
  name: "Stripe",
  type: PROVIDER_TYPES.PAYMENT,
  capabilities: [
    "payment",
    "refund",
    "webhook",
    "customer",
  ],

  async execute({ capability, context, payload }) {
    throw new Error(
      `Stripe provider '${capability}' not implemented`
    );
  },
});
