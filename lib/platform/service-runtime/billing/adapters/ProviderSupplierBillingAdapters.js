const MANAGED_SERVICE_USAGE = {
  adapter_id: "service-usage-managed",
  billing_mode: "USAGE_METERED",
  billing_owner: "AVANTIQO",
  customer_funding: "AVANTIQO_WALLET",
  supplier_cost_source: "SERVICE_PRICING",
  supplier_configuration: "MANAGED_PROVIDER_ACCOUNT",
  requires_provider_pricing: true,
  requires_supplier_account_config: false,
  external_provider_billing: false,
  configurable: false,
  configuration_route: null,
  configuration_api: null,
  note: "Supplier cost is governed by Service Pricing, Usage, Wallet, Billing and Finance using the Avantiqo-managed provider account.",
};

const EXTERNAL_ACCOUNT_USAGE = {
  adapter_id: "service-usage-external-account",
  billing_mode: "EXTERNAL_ACCOUNT_USAGE",
  billing_owner: "CONNECTION_OWNER",
  customer_funding: "PROVIDER_ACCOUNT_OR_SERVICE_POLICY",
  supplier_cost_source: "EXTERNAL_PROVIDER_ACCOUNT",
  supplier_configuration: "CONNECTED_PROVIDER_ACCOUNT",
  requires_provider_pricing: false,
  requires_supplier_account_config: false,
  external_provider_billing: true,
  configurable: false,
  configuration_route: null,
  configuration_api: null,
  note: "The connected provider account owns provider-side payment. Avantiqo does not create a duplicate supplier bill for this integration.",
};

const PROVIDER_OVERRIDES = {
  google_ads: {
    adapter_id: "google-ads-monthly-invoicing",
    billing_mode: "MANAGED_MEDIA_MONTHLY_INVOICING",
    billing_owner: "AVANTIQO",
    customer_funding: "AVANTIQO_PREPAID_WALLET",
    supplier_cost_source: "MANAGED_MEDIA_SETTLEMENT",
    supplier_configuration: "GOOGLE_PAYMENTS_ACCOUNT",
    requires_provider_pricing: false,
    requires_supplier_account_config: true,
    external_provider_billing: false,
    configurable: true,
    configuration_route: "/settings/integrations/provider-billing",
    configuration_api: "/api/administration/integrations/provider-billing",
    note: "Google Ads supplier payment is attached to the Avantiqo Google Payments account. Customer wallet and media markup settlement remain in Services.",
  },
  meta: {
    adapter_id: "meta-managed-media",
    billing_mode: "MANAGED_MEDIA",
    billing_owner: "AVANTIQO",
    customer_funding: "AVANTIQO_PREPAID_WALLET",
    supplier_cost_source: "MANAGED_MEDIA_SETTLEMENT",
    supplier_configuration: "MANAGED_META_AD_ACCOUNT",
    requires_provider_pricing: false,
    requires_supplier_account_config: false,
    external_provider_billing: false,
    configurable: false,
    configuration_route: null,
    configuration_api: null,
    note: "Managed Meta media spend is settled through the existing managed-media runtime. Customer funding remains in the Avantiqo wallet.",
  },
};

function text(value) {
  return String(value ?? "").trim();
}

function defaultAdapter(provider = {}) {
  return text(provider.connectionModel).toLowerCase() === "managed"
    ? MANAGED_SERVICE_USAGE
    : EXTERNAL_ACCOUNT_USAGE;
}

export function resolveProviderSupplierBillingAdapter(provider = {}) {
  return {
    ...defaultAdapter(provider),
    ...(PROVIDER_OVERRIDES[provider.id] || {}),
  };
}

export const ProviderSupplierBillingAdapters = {
  managed_service_usage: MANAGED_SERVICE_USAGE,
  external_account_usage: EXTERNAL_ACCOUNT_USAGE,
  overrides: PROVIDER_OVERRIDES,
  resolve: resolveProviderSupplierBillingAdapter,
};
