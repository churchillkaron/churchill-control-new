import { PROVIDER_REGISTRY } from "../ProviderRegistry.js";

PROVIDER_REGISTRY.threads = {
  id: "threads",
  connectionModel: "oauth",
  name: "Threads",
  category: "marketing",
  capabilities: [
    "marketing.threads.publish",
    "marketing.threads.replies.read",
    "marketing.threads.reply.manage",
    "marketing.threads.insights.read",
    "marketing.threads.account.insights.read",
  ],
  countries: ["*"],
  currencies: ["*"],
  runtime: "threads",
  runtimeAvailable: true,
  active: true,
  metadata: {
    customer_provider_account_required: true,
    supplier_billing_required: false,
    oauth_scopes: [
      "threads_basic",
      "threads_content_publish",
      "threads_manage_insights",
      "threads_read_replies",
      "threads_manage_replies",
    ],
    supports_carousel: true,
    carousel_min_items: 2,
    carousel_max_items: 20,
    long_lived_token_refresh: true,
  },
};
