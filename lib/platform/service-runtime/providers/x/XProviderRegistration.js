import { PROVIDER_REGISTRY } from "../ProviderRegistry.js";

// X uses organization-scoped OAuth 2.0 PKCE with media.write for platform publishing.
PROVIDER_REGISTRY.x = {
  id: "x",
  connectionModel: "oauth_pkce",
  name: "X",
  category: "marketing",
  capabilities: ["marketing.x.publish"],
  countries: ["*"],
  currencies: ["*"],
  runtime: "x",
  runtimeAvailable: true,
  active: true,
  metadata: {
    customer_provider_account_required: true,
    supplier_billing_required: false,
    oauth_scopes: [
      "tweet.read",
      "tweet.write",
      "users.read",
      "media.write",
      "offline.access",
    ],
  },
};
