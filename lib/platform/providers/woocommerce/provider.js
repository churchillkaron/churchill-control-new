import { providerRuntime, PROVIDER_TYPES } from "../ProviderRuntime";

providerRuntime.register({
  id: "woocommerce",
  name: "WooCommerce",
  type: PROVIDER_TYPES.OTHER,
  authentication: "api_key",
  billing_units: [
  "api_call",
  "transaction"
],
  capabilities: [
  "COMMERCE"
],
  industries: ["all"],
  regions: ["global"],
  models: [],
  pricing: {},
  limits: {},
  metadata: {},

  async execute({ capability }) {
    throw new Error(
      `WooCommerce provider '${capability}' not implemented`
    );
  },
});
