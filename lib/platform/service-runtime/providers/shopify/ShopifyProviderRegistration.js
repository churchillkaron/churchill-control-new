import { PROVIDER_REGISTRY } from "../ProviderRegistry.js";

PROVIDER_REGISTRY.shopify = {
  id: "shopify",
  connectionModel: "oauth",
  name: "Shopify",
  category: "commerce",
  capabilities: [
    "commerce.shopify.products.read",
    "commerce.shopify.orders.read",
    "commerce.shopify.inventory.read",
    "commerce.shopify.locations.read",
  ],
  countries: ["*"],
  currencies: ["*"],
  runtime: "shopify",
  runtimeAvailable: true,
  active: true,
  metadata: {
    customer_provider_account_required: true,
    supplier_billing_required: false,
    api_family: "SHOPIFY_GRAPHQL_ADMIN",
    api_version: "2026-07",
  },
};
