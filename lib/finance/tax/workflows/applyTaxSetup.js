import { supabaseAdmin } from "@/lib/shared/supabase/admin";

/**
 * AUTO TAX SETUP (TH / EU / USA)
 * Runs during onboarding
 */
export async function applyTaxSetup({
  organizationId,
  organizationId,
  taxRegime,
  accountingStandard
}) {
  if (!organizationId || !organizationId) {
    throw new Error("Missing onboarding context");
  }

  // 1. Update accounting profile
  const { error: profileError } = await supabaseAdmin
    .from("organization_accounting_profiles")
    .upsert({
      organization_id: organizationId,
      accounting_mode: "operational_entity",
      tax_regime: taxRegime,
      accounting_standard: accountingStandard,
      base_currency:
        taxRegime === "EU" ? "EUR" :
        taxRegime === "USA" ? "USD" : "THB",
      reporting_currency:
        taxRegime === "EU" ? "EUR" :
        taxRegime === "USA" ? "USD" : "THB",
      fiscal_year_start_month: 1,
      fiscal_year_start_day: 1,
      status: "ACTIVE"
    });

  if (profileError) throw profileError;

  // 2. Insert tax rules (simple default engine)
  const rules = getTaxRules(taxRegime);

  const { error: ruleError } = await supabaseAdmin
    .from("tax_rules")
    .upsert(rules, { onConflict: "tax_regime,tax_code" });

  if (ruleError) throw ruleError;

  return {
    success: true,
    taxRegime,
    accountingStandard
  };
}

/**
 * TAX RULES BY COUNTRY
 */
function getTaxRules(taxRegime) {
  if (taxRegime === "THAILAND") {
    return [
      {
        tax_regime: "THAILAND",
        accounting_standard: "TFRS",
        tax_code: "VAT",
        tax_name: "VAT 7%",
        tax_rate: 0.07,
        is_active: true
      },
      {
        tax_regime: "THAILAND",
        accounting_standard: "TFRS",
        tax_code: "WHT",
        tax_name: "Withholding Tax",
        tax_rate: 0.03,
        is_active: true
      }
    ];
  }

  if (taxRegime === "EU") {
    return [
      {
        tax_regime: "EU",
        accounting_standard: "IFRS",
        tax_code: "VAT",
        tax_name: "EU VAT",
        tax_rate: 0.2,
        is_active: true
      }
    ];
  }

  return [
    {
      tax_regime: "USA",
      accounting_standard: "US_GAAP",
      tax_code: "SALES_TAX",
      tax_name: "Sales Tax",
      tax_rate: 0.08,
      is_active: true
    }
  ];
}
