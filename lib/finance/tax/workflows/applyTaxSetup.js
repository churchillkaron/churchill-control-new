import { supabaseAdmin } from "@/lib/shared/supabase/admin";

async function saveOrganizationTaxRule(rule) {
  const inserted = await supabaseAdmin
    .from("tax_rules")
    .insert(rule)
    .select("id")
    .single();

  if (!inserted.error) return inserted.data;
  if (inserted.error.code !== "23505") throw inserted.error;

  const existing = await supabaseAdmin
    .from("tax_rules")
    .select("id")
    .eq("organization_id", rule.organization_id)
    .eq("tax_regime", rule.tax_regime)
    .eq("accounting_standard", rule.accounting_standard)
    .eq("tax_code", rule.tax_code)
    .eq("effective_from", rule.effective_from)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data?.id) throw inserted.error;

  const updated = await supabaseAdmin
    .from("tax_rules")
    .update({ ...rule, id: undefined })
    .eq("id", existing.data.id)
    .eq("organization_id", rule.organization_id)
    .select("id")
    .single();
  if (updated.error) throw updated.error;
  return updated.data;
}

export async function applyTaxSetup({
  organizationId,
  taxRegime = "UNCONFIGURED",
  accountingStandard = "IFRS",
  accountingMode = "operational_entity",
  baseCurrency,
  vatRegistered = false,
  withholdingTaxEnabled = false,
  vatRate = null,
  vatRateValidThrough = null,
  fiscalYearStartMonth = 1,
  fiscalYearStartDay = 1,
  fiscalYearEndMonth = 12,
  fiscalYearEndDay = 31,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const normalizedCurrency = String(baseCurrency || "").trim().toUpperCase();

  if (!normalizedCurrency) {
    throw new Error("baseCurrency required");
  }

  const { data: profile, error: profileError } =
    await supabaseAdmin
      .from("organization_accounting_profiles")
      .upsert(
        {
          organization_id: organizationId,
          accounting_mode: accountingMode,
          tax_regime: taxRegime,
          accounting_standard: accountingStandard,
          base_currency: normalizedCurrency,
          reporting_currency: normalizedCurrency,
          fiscal_year_start_month: Number(fiscalYearStartMonth) || 1,
          fiscal_year_start_day: Number(fiscalYearStartDay) || 1,
          fiscal_year_end_month: Number(fiscalYearEndMonth) || 12,
          fiscal_year_end_day: Number(fiscalYearEndDay) || 31,
          vat_registered: Boolean(vatRegistered),
          withholding_tax_enabled: Boolean(withholdingTaxEnabled),
          multi_currency_enabled: false,
          status: "ACTIVE",
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "organization_id",
        }
      )
      .select()
      .single();

  if (profileError) {
    throw profileError;
  }

  const rules = getTaxRules({
    organizationId,
    taxRegime,
    accountingStandard,
    vatRegistered,
    withholdingTaxEnabled,
    vatRate,
    vatRateValidThrough,
  });

  if (taxRegime === "THAILAND") {
    const now = new Date().toISOString();
    const { error: deactivateError } = await supabaseAdmin
      .from("tax_rules")
      .update({ is_active: false, updated_at: now })
      .eq("organization_id", organizationId)
      .eq("tax_regime", taxRegime)
      .eq("accounting_standard", accountingStandard)
      .eq("tax_code", "VAT")
      .eq("is_active", true);
    if (deactivateError) throw deactivateError;
  }

  for (const rule of rules) {
    await saveOrganizationTaxRule(rule);
  }

  return {
    success: true,
    profile,
  };
}

function getTaxRules({
  organizationId,
  taxRegime,
  accountingStandard,
  vatRegistered,
  withholdingTaxEnabled,
  vatRate,
  vatRateValidThrough,
}) {
  if (taxRegime === "THAILAND") {
    const rules = [];
    if (vatRegistered) {
      rules.push({
        organization_id: organizationId,
        tax_regime: "THAILAND",
        accounting_standard: accountingStandard || "TFRS",
        tax_code: "VAT",
        tax_name: `VAT ${Math.round(Number(vatRate || 0.07) * 100)}%`,
        tax_type: "VAT",
        tax_rate: Number(vatRate || 0.07),
        effective_from: new Date().toISOString().slice(0, 10),
        effective_to: vatRateValidThrough || null,
        is_active: true,
        updated_at: new Date().toISOString(),
      });
    }
    // Thailand withholding tax rates depend on payment/income type; do not create one universal WHT rate here.
    // `withholdingTaxEnabled` keeps the jurisdiction framework enabled for transaction-specific rules.
    void withholdingTaxEnabled;
    return rules;
  }

  return [];
}
