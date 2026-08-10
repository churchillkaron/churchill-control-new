import "../../providers/google/GoogleProviderRegistration.js";
import "../../providers/gemini/GeminiProviderRegistration.js";
import "../../providers/fal/FalProviderRegistration.js";
import "../../providers/lipsync/ManagedLipSyncProviderRegistration.js";

import { PROVIDER_REGISTRY } from "../../providers/ProviderRegistry.js";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PROVIDER_OVERRIDES = {
  google_ads: {
    adapter_id: "google-ads-monthly-invoicing",
    billing_mode: "MANAGED_MEDIA_MONTHLY_INVOICING",
    billing_owner: "AVANTIQO",
    customer_funding: "AVANTIQO_PREPAID_WALLET",
    supplier_cost_source: "MANAGED_MEDIA_SETTLEMENT",
    supplier_configuration: "GOOGLE_PAYMENTS_ACCOUNT",
    configurable: true,
    configuration_route: "/settings/integrations/provider-billing",
    configuration_api: "/api/administration/integrations/provider-billing/google-ads",
    note: "Google Ads supplier payment is attached to the Avantiqo Google Payments account. Customer wallet and markup settlement remain in Services.",
  },
  meta: {
    adapter_id: "meta-managed-media",
    billing_mode: "MANAGED_MEDIA",
    billing_owner: "AVANTIQO",
    customer_funding: "AVANTIQO_PREPAID_WALLET",
    supplier_cost_source: "MANAGED_MEDIA_SETTLEMENT",
    supplier_configuration: "MANAGED_META_AD_ACCOUNT",
    configurable: false,
    note: "Managed Meta media spend is settled through the existing managed-media runtime. Customer funding remains in the Avantiqo wallet.",
  },
};

const PRIORITY = new Map([
  ["google_ads", 10],
  ["meta", 20],
  ["openai", 30],
  ["gemini", 40],
  ["runway", 50],
  ["fal", 60],
]);

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function defaultAdapter(provider = {}) {
  const connectionModel = text(provider.connectionModel).toLowerCase();
  const avantiqoManaged = connectionModel === "managed";

  return {
    adapter_id: avantiqoManaged ? "service-usage-managed" : "service-usage-external-account",
    billing_mode: avantiqoManaged ? "USAGE_METERED" : "EXTERNAL_ACCOUNT_USAGE",
    billing_owner: avantiqoManaged ? "AVANTIQO" : "CONNECTION_OWNER",
    customer_funding: avantiqoManaged ? "AVANTIQO_WALLET" : "PROVIDER_ACCOUNT_OR_SERVICE_POLICY",
    supplier_cost_source: "SERVICE_PRICING",
    supplier_configuration: avantiqoManaged ? "MANAGED_PROVIDER_ACCOUNT" : "CONNECTED_PROVIDER_ACCOUNT",
    configurable: false,
    configuration_route: null,
    configuration_api: null,
    note: avantiqoManaged
      ? "Supplier cost is governed by Service Pricing, Usage, Wallet and Billing using the Avantiqo-managed provider account."
      : "Provider usage remains governed by Services; the connected external account owns any provider-side payment method unless a managed adapter overrides it.",
  };
}

function adapterFor(provider = {}) {
  return {
    ...defaultAdapter(provider),
    ...(PROVIDER_OVERRIDES[provider.id] || {}),
  };
}

async function activePricingRows() {
  const { data, error } = await supabaseAdmin
    .from("provider_pricing")
    .select("id,provider,capability,model,currency,unit,cost_per_unit,input_cost_per_1m,output_cost_per_1m,markup_percent,metadata,active,created_at")
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

function publicPricing(row = {}) {
  return {
    id: row.id,
    capability: row.capability || null,
    model: row.model || null,
    currency: upper(row.currency) || null,
    unit: row.unit || null,
    cost_per_unit: Number(row.cost_per_unit || 0),
    input_cost_per_1m: Number(row.input_cost_per_1m || 0),
    output_cost_per_1m: Number(row.output_cost_per_1m || 0),
    markup_percent: Number(row.markup_percent || 0),
    pricing_mode: row.metadata?.pricing_mode || null,
  };
}

function providerSnapshot(provider = {}, pricingRows = []) {
  const adapter = adapterFor(provider);
  const rows = pricingRows.filter((row) => row.provider === provider.id);
  const runtimeAvailable = provider.runtimeAvailable !== false;
  const pricingConfigured = rows.length > 0;
  const serviceCostControlReady =
    adapter.supplier_cost_source === "MANAGED_MEDIA_SETTLEMENT"
      ? runtimeAvailable
      : runtimeAvailable && pricingConfigured;

  return {
    id: provider.id,
    name: provider.name || provider.id,
    category: provider.category || "other",
    connection_model: provider.connectionModel || null,
    runtime: provider.runtime || null,
    runtime_available: runtimeAvailable,
    active: provider.active !== false,
    capabilities: Array.isArray(provider.capabilities) ? provider.capabilities : [],
    adapter,
    pricing: rows.map(publicPricing),
    pricing_count: rows.length,
    pricing_configured: pricingConfigured,
    currencies: unique(rows.map((row) => upper(row.currency))).sort(),
    priced_capabilities: unique(rows.map((row) => row.capability)).sort(),
    service_cost_control_ready: serviceCostControlReady,
    adapter_status: runtimeAvailable ? "REGISTERED" : "REGISTERED_RUNTIME_UNAVAILABLE",
  };
}

async function snapshot() {
  const pricingRows = await activePricingRows();
  const providers = Object.values(PROVIDER_REGISTRY)
    .filter((provider) => provider && provider.active !== false)
    .map((provider) => providerSnapshot(provider, pricingRows))
    .sort((left, right) => {
      const leftPriority = PRIORITY.get(left.id) ?? 1000;
      const rightPriority = PRIORITY.get(right.id) ?? 1000;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return String(left.name).localeCompare(String(right.name));
    });

  return {
    providers,
    summary: {
      registered_providers: providers.length,
      adapters_registered: providers.length,
      providers_without_adapter: [],
      runtime_available: providers.filter((provider) => provider.runtime_available).length,
      pricing_configured: providers.filter((provider) => provider.pricing_configured).length,
      service_cost_control_ready: providers.filter((provider) => provider.service_cost_control_ready).length,
      configurable_supplier_accounts: providers.filter((provider) => provider.adapter.configurable).length,
    },
    contract: {
      source_of_truth: "SERVICE_DOMAIN",
      flow: [
        "SERVICE_CAPABILITY",
        "PROVIDER_RESOLVER",
        "PRICING",
        "USAGE",
        "WALLET",
        "BILLING",
        "FINANCE",
      ],
      duplicate_billing_domain: false,
    },
  };
}

export const ProviderBillingRuntime = {
  snapshot,
  adapterFor(providerId) {
    const provider = PROVIDER_REGISTRY[providerId] || null;
    return provider ? adapterFor(provider) : null;
  },
};
