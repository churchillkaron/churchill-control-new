const AVANTIQO_SERVICE_USAGE = {
  adapter_id: "avantiqo-service-usage",
  billing_mode: "AVANTIQO_SUPPLIER_USAGE",
  billing_owner: "AVANTIQO",
  customer_funding: "AVANTIQO_PREPAID_WALLET",
  supplier_cost_source: "SERVICE_PRICING",
  supplier_configuration: "AVANTIQO_MANAGED_SUPPLIER_ACCOUNT",
  requires_provider_pricing: true,
  requires_supplier_account_config: true,
  supplier_invoice_or_charge_required: true,
  customer_direct_provider_billing_allowed: false,
  customer_provider_payment_method_allowed: false,
  external_provider_billing: false,
  configurable: false,
  configuration_route: null,
  configuration_api: null,
  note: "The provider is an Avantiqo supplier. The provider invoices or charges Avantiqo; Avantiqo records supplier cost and charges the customer only through the prepaid Avantiqo wallet.",
};

const PROVIDER_OVERRIDES = {
  google_ads: {
    adapter_id: "google-ads-monthly-invoicing",
    billing_mode: "AVANTIQO_MANAGED_MEDIA_MONTHLY_INVOICING",
    billing_owner: "AVANTIQO",
    customer_funding: "AVANTIQO_PREPAID_WALLET",
    supplier_cost_source: "MANAGED_MEDIA_SETTLEMENT",
    supplier_configuration: "AVANTIQO_GOOGLE_PAYMENTS_ACCOUNT",
    requires_provider_pricing: false,
    requires_supplier_account_config: true,
    supplier_invoice_or_charge_required: true,
    customer_direct_provider_billing_allowed: false,
    customer_provider_payment_method_allowed: false,
    external_provider_billing: false,
    configurable: true,
    configuration_route: "/settings/integrations/provider-billing",
    configuration_api: "/api/administration/integrations/provider-billing",
    note: "Google bills the Avantiqo Google Payments account for managed advertiser spend. Customers fund Avantiqo only through their prepaid wallet.",
  },
  meta: {
    adapter_id: "meta-managed-media",
    billing_mode: "AVANTIQO_MANAGED_MEDIA",
    billing_owner: "AVANTIQO",
    customer_funding: "AVANTIQO_PREPAID_WALLET",
    supplier_cost_source: "MANAGED_MEDIA_SETTLEMENT",
    supplier_configuration: "AVANTIQO_MANAGED_META_AD_ACCOUNT",
    requires_provider_pricing: false,
    requires_supplier_account_config: true,
    supplier_invoice_or_charge_required: true,
    customer_direct_provider_billing_allowed: false,
    customer_provider_payment_method_allowed: false,
    external_provider_billing: false,
    configurable: false,
    configuration_route: null,
    configuration_api: null,
    note: "Meta charges the Avantiqo-managed advertising account. Customer media budget and Avantiqo fee are reserved from the prepaid wallet before provider execution.",
  },
};

export function resolveProviderSupplierBillingAdapter(provider = {}) {
  return {
    ...AVANTIQO_SERVICE_USAGE,
    ...(PROVIDER_OVERRIDES[provider.id] || {}),
    provider_authorization_model: provider.connectionModel || null,
  };
}

export function assertAvantiqoSupplierBilling(provider = {}) {
  const adapter = resolveProviderSupplierBillingAdapter(provider);

  if (
    adapter.billing_owner !== "AVANTIQO" ||
    adapter.external_provider_billing === true ||
    adapter.customer_direct_provider_billing_allowed !== false ||
    adapter.customer_provider_payment_method_allowed !== false
  ) {
    throw new Error(`PROVIDER_BILLING_MUST_BE_AVANTIQO:${provider.id || "unknown"}`);
  }

  return adapter;
}

export const ProviderSupplierBillingAdapters = {
  avantiqo_service_usage: AVANTIQO_SERVICE_USAGE,
  overrides: PROVIDER_OVERRIDES,
  resolve: resolveProviderSupplierBillingAdapter,
  assert: assertAvantiqoSupplierBilling,
};
