import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CYCLES = new Set(["monthly", "yearly"]);

function clean(value) {
  return String(value ?? "").trim();
}

function cycle(value) {
  const normalized = clean(value).toLowerCase();
  if (!CYCLES.has(normalized)) {
    throw new Error("BILLING_CYCLE_INVALID");
  }
  return normalized;
}

function currency(value) {
  const normalized = clean(value).toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error("BILLING_CURRENCY_INVALID");
  }
  return normalized;
}

export function stripeCatalogEnvironment() {
  const key = clean(process.env.STRIPE_SECRET_KEY);
  if (key.startsWith("sk_live_")) return "live";
  if (key.startsWith("sk_test_")) return "sandbox";
  throw new Error("STRIPE_SECRET_KEY is not configured");
}

export async function getOrganizationModuleBillingCatalog({
  organizationId,
  billingCycle = "monthly",
  provider = "stripe",
  environment = null,
}) {
  const organization = clean(organizationId);
  if (!organization) throw new Error("ORGANIZATION_ID_REQUIRED");

  const resolvedCycle = cycle(billingCycle);
  const resolvedEnvironment =
    clean(environment).toLowerCase() ||
    (provider === "stripe" ? stripeCatalogEnvironment() : "production");

  const { data: modules, error: modulesError } = await supabaseAdmin
    .from("organization_modules")
    .select("module_id,status")
    .eq("organization_id", organization)
    .eq("status", "ACTIVE");

  if (modulesError) throw modulesError;

  const activeModuleIds = [...new Set(
    (modules || []).map((row) => clean(row.module_id)).filter(Boolean),
  )];

  if (!activeModuleIds.length) {
    return {
      organizationId: organization,
      billingCycle: resolvedCycle,
      provider,
      environment: resolvedEnvironment,
      items: [],
      unpricedModules: [],
      missingMappings: [],
      currency: null,
      total: 0,
    };
  }

  const { data: pricing, error: pricingError } = await supabaseAdmin
    .from("platform_module_pricing")
    .select("module_id,monthly_price,yearly_price,currency,active")
    .in("module_id", activeModuleIds)
    .eq("active", true);

  if (pricingError) throw pricingError;

  const pricingByModule = new Map(
    (pricing || []).map((row) => [clean(row.module_id), row]),
  );

  const pricedRows = activeModuleIds
    .map((moduleId) => {
      const row = pricingByModule.get(moduleId);
      if (!row) return null;

      const canonicalAmount = Number(
        resolvedCycle === "yearly" ? row.yearly_price : row.monthly_price,
      );
      if (!Number.isFinite(canonicalAmount) || canonicalAmount <= 0) return null;

      return {
        module_id: moduleId,
        amount: canonicalAmount,
        currency: currency(row.currency),
      };
    })
    .filter(Boolean);

  const unpricedModules = activeModuleIds.filter(
    (moduleId) => !pricedRows.some((row) => row.module_id === moduleId),
  );

  if (!pricedRows.length) {
    return {
      organizationId: organization,
      billingCycle: resolvedCycle,
      provider,
      environment: resolvedEnvironment,
      items: [],
      unpricedModules,
      missingMappings: [],
      currency: null,
      total: 0,
    };
  }

  const currencies = [...new Set(pricedRows.map((row) => row.currency))];
  if (currencies.length !== 1) {
    throw new Error("BILLING_MULTI_CURRENCY_MODULE_SET_UNSUPPORTED");
  }
  const resolvedCurrency = currencies[0];

  const { data: mappings, error: mappingsError } = await supabaseAdmin
    .from("billing_provider_price_mappings")
    .select(
      "module_id,billing_cycle,currency,provider_product_id,provider_price_id,active",
    )
    .eq("provider", provider)
    .eq("environment", resolvedEnvironment)
    .eq("billing_cycle", resolvedCycle)
    .eq("currency", resolvedCurrency)
    .eq("active", true)
    .in("module_id", pricedRows.map((row) => row.module_id));

  if (mappingsError) throw mappingsError;

  const mappingByModule = new Map(
    (mappings || []).map((row) => [clean(row.module_id), row]),
  );

  const missingMappings = pricedRows
    .filter((row) => !mappingByModule.has(row.module_id))
    .map((row) => row.module_id);

  const items = pricedRows
    .map((row) => {
      const mapping = mappingByModule.get(row.module_id);
      if (!mapping) return null;
      return {
        ...row,
        provider_product_id: mapping.provider_product_id,
        provider_price_id: mapping.provider_price_id,
      };
    })
    .filter(Boolean);

  return {
    organizationId: organization,
    billingCycle: resolvedCycle,
    provider,
    environment: resolvedEnvironment,
    items,
    unpricedModules,
    missingMappings,
    currency: resolvedCurrency,
    total: items.reduce((sum, item) => sum + Number(item.amount), 0),
  };
}
