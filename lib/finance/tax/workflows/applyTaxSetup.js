import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function applyTaxSetup({
  organizationId,
  taxRegime = "THAILAND",
  accountingStandard = "TFRS",
  accountingMode = "operational_entity",
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const currency =
    taxRegime === "EU"
      ? "EUR"
      : taxRegime === "USA"
        ? "USD"
        : "THB";

  const { data: profile, error: profileError } =
    await supabaseAdmin
      .from("organization_accounting_profiles")
      .upsert(
        {
          organization_id: organizationId,
          accounting_mode: accountingMode,
          tax_regime: taxRegime,
          accounting_standard: accountingStandard,
          base_currency: currency,
          reporting_currency: currency,
          fiscal_year_start_month: 1,
          fiscal_year_start_day: 1,
          fiscal_year_end_month: 12,
          fiscal_year_end_day: 31,
          vat_registered: taxRegime === "THAILAND",
          withholding_tax_enabled: taxRegime === "THAILAND",
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
    taxRegime,
    accountingStandard,
  });

  if (rules.length) {
    const { error: ruleError } =
      await supabaseAdmin
        .from("tax_rules")
        .upsert(
          rules,
          {
            onConflict: "tax_regime,tax_code",
          }
        );

    if (ruleError) {
      throw ruleError;
    }
  }

  return {
    success: true,
    profile,
  };
}

function getTaxRules({
  taxRegime,
  accountingStandard,
}) {
  if (taxRegime === "THAILAND") {
    return [
      {
        tax_regime: "THAILAND",
        accounting_standard: accountingStandard || "TFRS",
        tax_code: "VAT",
        tax_name: "VAT 7%",
        tax_rate: 0.07,
        is_active: true,
      },
      {
        tax_regime: "THAILAND",
        accounting_standard: accountingStandard || "TFRS",
        tax_code: "WHT",
        tax_name: "Withholding Tax",
        tax_rate: 0.03,
        is_active: true,
      },
    ];
  }

  if (taxRegime === "EU") {
    return [
      {
        tax_regime: "EU",
        accounting_standard: accountingStandard || "IFRS",
        tax_code: "VAT",
        tax_name: "EU VAT",
        tax_rate: 0.2,
        is_active: true,
      },
    ];
  }

  if (taxRegime === "USA") {
    return [
      {
        tax_regime: "USA",
        accounting_standard: accountingStandard || "US_GAAP",
        tax_code: "SALES_TAX",
        tax_name: "Sales Tax",
        tax_rate: 0.08,
        is_active: true,
      },
    ];
  }

  return [];
}
