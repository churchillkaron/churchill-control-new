import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function normalizeRate(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }

  return numeric > 1 ? numeric / 100 : numeric;
}

function isEffective(rule, transactionDate) {
  const date = transactionDate.slice(0, 10);

  if (rule.effective_from && rule.effective_from > date) {
    return false;
  }

  if (rule.effective_to && rule.effective_to < date) {
    return false;
  }

  return rule.is_active !== false;
}

function settingsPayload(row) {
  const nested =
    row?.settings && typeof row.settings === "object" ? row.settings : {};

  return {
    ...(row || {}),
    ...nested,
  };
}

export async function resolvePOSFinancialPolicy({
  organizationId,
  transactionDate = new Date().toISOString(),
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const [settingsResult, taxResult] = await Promise.all([
    supabaseAdmin
      .from("operational_settings")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("domain", "POS")
      .maybeSingle(),
    supabaseAdmin
      .from("tax_rules")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true),
  ]);

  if (settingsResult.error && settingsResult.error.code !== "PGRST116") {
    throw settingsResult.error;
  }

  if (taxResult.error) {
    throw taxResult.error;
  }

  const settings = settingsPayload(settingsResult.data);
  const effectiveTaxes = (taxResult.data || []).filter((rule) =>
    isEffective(rule, transactionDate)
  );

  const defaultTax =
    effectiveTaxes.find(
      (rule) =>
        rule.is_default === true ||
        rule.default === true ||
        rule.applies_to === "POS" ||
        rule.tax_regime === "POS"
    ) || effectiveTaxes[0] || null;

  const serviceChargeEnabled =
    settings.service_charge_enabled === true ||
    settings.enable_service_charge === true;

  const serviceChargeRate = serviceChargeEnabled
    ? normalizeRate(
        settings.service_charge_rate ??
          settings.service_charge_percent ??
          settings.service_charge_percentage
      )
    : 0;

  return {
    serviceChargeRate,
    taxRate: normalizeRate(defaultTax?.tax_rate),
    taxCodeId: defaultTax?.id || null,
    taxCode: defaultTax?.tax_code || null,
    pricesIncludeTax:
      settings.prices_include_tax === true ||
      settings.tax_inclusive === true,
  };
}
