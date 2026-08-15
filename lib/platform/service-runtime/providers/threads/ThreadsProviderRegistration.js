import { PROVIDER_REGISTRY } from "../ProviderRegistry.js";

PROVIDER_REGISTRY.threads = {
  id: "threads",
  connectionModel: "oauth",
  name: "Threads",
  category: "marketing",
  capabilities: ["marketing.threads.publish"],
  countries: ["*"],
  currencies: ["*"],
  runtime: "threads",
  runtimeAvailable: true,
  active: true,
  metadata: {
    customer_provider_account_required: true,
    supplier_billing_required: false,
  },
};
