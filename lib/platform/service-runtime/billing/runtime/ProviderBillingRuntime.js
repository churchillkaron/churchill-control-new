import "../../providers/google/GoogleProviderRegistration.js";
import "../../providers/gemini/GeminiProviderRegistration.js";
import "../../providers/fal/FalProviderRegistration.js";
import "../../providers/lipsync/ManagedLipSyncProviderRegistration.js";

import { PROVIDER_REGISTRY } from "../../providers/ProviderRegistry.js";
import {
  assertAvantiqoSupplierBilling,
  resolveProviderSupplierBillingAdapter,
} from "../adapters/ProviderSupplierBillingAdapters.js";
import { ProviderSupplierAccountRuntime } from "./ProviderSupplierAccountRuntime.js";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

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

function isActiveAccount(account = {}) {
  return upper(account.status) === "ACTIVE";
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

function providerStatus({ runtimeAvailable, pricingReady, supplierAccount }) {
  if (!runtimeAvailable) {
    return {
      ready: false,
      status: "RUNTIME_UNAVAILABLE",
      blocker: "PROVIDER_RUNTIME_UNAVAILABLE",
    };
  }
  if (!pricingReady) {
    return {
      ready: false,
      status: "PRICING_REQUIRED",
      blocker: "AVANTIQO_PROVIDER_PRICING_REQUIRED",
    };
  }
  if (!supplierAccount?.ready) {
    return {
      ready: false,
      status: supplierAccount?.status || "PAYER_ORGANIZATION_REQUIRED",
      blocker:
        supplierAccount?.blocker || "AVANTIQO_PROVIDER_PAYER_ORGANIZATION_REQUIRED",
    };
  }

  return { ready: true, status: "READY", blocker: null };
}

function providerSnapshot(provider = {}, pricingRows = [], supplierAccount = null) {
  const adapter = assertAvantiqoSupplierBilling(provider);
  const rows = pricingRows.filter((row) => row.provider === provider.id);
  const runtimeAvailable = provider.runtimeAvailable !== false;
  const pricingConfigured = rows.length > 0;
  const pricingReady = adapter.requires_provider_pricing === false || pricingConfigured;
  const readiness = providerStatus({ runtimeAvailable, pricingReady, supplierAccount });

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
    supplier_account: supplierAccount?.account || null,
    supplier_account_ready: supplierAccount?.ready === true,
    service_cost_control_ready: readiness.ready,
    billing_status: readiness.status,
    billing_blocker: readiness.blocker,
    supplier_billed_to_avantiqo: adapter.billing_owner === "AVANTIQO",
    customer_direct_provider_billing_allowed: false,
    customer_provider_payment_method_allowed: false,
    prepaid_provider_execution_required: true,
    adapter_status: readiness.status,
  };
}

function accountStatusForProvider(providerId, accounts = []) {
  const rows = accounts.filter((account) => account.provider_id === providerId);
  const activeRows = rows.filter(isActiveAccount);

  if (activeRows.length > 1) {
    return {
      account: null,
      ready: false,
      status: "PAYER_AMBIGUOUS",
      blocker: `AVANTIQO_PROVIDER_PAYER_AMBIGUOUS:${providerId}`,
    };
  }

  const account = activeRows[0] || rows[0] || null;
  if (!account) {
    return {
      account: null,
      ready: false,
      status: "PAYER_ORGANIZATION_REQUIRED",
      blocker: "AVANTIQO_PROVIDER_PAYER_ORGANIZATION_REQUIRED",
    };
  }

  return {
    account,
    ready: account.ready === true,
    status: account.status || "PAYER_ORGANIZATION_REQUIRED",
    blocker: account.blocker || "AVANTIQO_PROVIDER_PAYER_ORGANIZATION_REQUIRED",
  };
}

async function snapshot() {
  const [pricingRows, supplierGovernance] = await Promise.all([
    activePricingRows(),
    ProviderSupplierAccountRuntime.snapshot(),
  ]);

  const registeredIds = new Set(Object.keys(PROVIDER_REGISTRY));
  const orphanedPricing = pricingRows
    .filter((row) => !registeredIds.has(row.provider))
    .map((row) => ({ provider: row.provider, ...publicPricing(row) }));

  const providers = Object.values(PROVIDER_REGISTRY)
    .filter((provider) => provider && provider.active !== false)
    .map((provider) =>
      providerSnapshot(
        provider,
        pricingRows,
        accountStatusForProvider(provider.id, supplierGovernance.accounts),
      ),
    )
    .sort((left, right) => {
      const leftPriority = PRIORITY.get(left.id) ?? 1000;
      const rightPriority = PRIORITY.get(right.id) ?? 1000;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return String(left.name).localeCompare(String(right.name));
    });

  return {
    providers,
    orphaned_pricing: orphanedPricing,
    supplier_governance: supplierGovernance,
    summary: {
      registered_providers: providers.length,
      adapters_registered: providers.length,
      providers_without_adapter: [],
      runtime_available: providers.filter((provider) => provider.runtime_available).length,
      pricing_configured: providers.filter((provider) => provider.pricing_configured).length,
      supplier_accounts_configured: providers.filter((provider) => provider.supplier_account_ready).length,
      service_cost_control_ready: providers.filter((provider) => provider.service_cost_control_ready).length,
      configurable_supplier_accounts: providers.length,
      supplier_billed_to_avantiqo: providers.filter((provider) => provider.supplier_billed_to_avantiqo).length,
      customer_direct_provider_billing_allowed: 0,
      orphaned_pricing_rows: orphanedPricing.length,
    },
    contract: {
      source_of_truth: "SERVICE_DOMAIN",
      billing_operator: "AVANTIQO",
      customer_funding: "AVANTIQO_PREPAID_WALLET",
      customer_direct_provider_billing_allowed: false,
      customer_provider_payment_method_allowed: false,
      supplier_invoice_or_charge_required: true,
      legal_payer_organization_required: true,
      provider_supplier_master_required: true,
      payer_legal_entity_required: true,
      supplier_invoice_usage_reconciliation_required: true,
      prepaid_provider_execution_required: true,
      provider_executor_reservation_guard_required: true,
      flow: [
        "LEGAL_PAYER_ORGANIZATION",
        "PROVIDER_SUPPLIER_ACCOUNT",
        "PREPAID_WALLET_RESERVATION",
        "PROVIDER_EXECUTION",
        "USAGE_SETTLEMENT",
        "WALLET_CHARGE",
        "PROVIDER_SUPPLIER_CHARGE_OR_INVOICE",
        "FINANCE_VENDOR_INVOICE_AP",
        "SUPPLIER_INVOICE_USAGE_RECONCILIATION",
        "FINANCE_PAYMENT_APPROVAL",
      ],
      duplicate_billing_domain: false,
    },
  };
}

export const ProviderBillingRuntime = {
  snapshot,
  adapterFor(providerId) {
    const provider = PROVIDER_REGISTRY[providerId] || null;
    return provider ? resolveProviderSupplierBillingAdapter(provider) : null;
  },
  assertProvider(providerId) {
    const provider = PROVIDER_REGISTRY[providerId] || null;
    if (!provider) throw new Error(`Unknown provider: ${providerId}`);
    return assertAvantiqoSupplierBilling(provider);
  },
};
