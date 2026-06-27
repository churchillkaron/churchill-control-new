import { supabaseAdmin } from "@/lib/shared/supabase/admin";

/**
 * UNIFIED TAX ENGINE (TFRS + IFRS READY)
 * Single source of truth for all tax calculations
 */
export async function calculateTax({
  organizationId,
  organizationId,
  referenceType,
  referenceId,
  taxableAmount,
  taxCode = "VAT",
}) {
  if (!organizationId) throw new Error("organizationId required");

  // 1. Get accounting profile (THIS IS THE TRUTH SOURCE)
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("organization_accounting_profiles")
    .select("*")
    .eq("organization_id", organizationId)
    .single();

  if (profileError || !profile) {
    throw new Error("Accounting profile missing");
  }

  const taxRegime = profile.tax_regime;
  const standard = profile.accounting_standard;

  // 2. Get tax rule (regime-based)
  const { data: rule, error: ruleError } = await supabaseAdmin
    .from("tax_rules")
    .select("*")
    .eq("tax_regime", taxRegime)
    .eq("accounting_standard", standard)
    .eq("tax_code", taxCode)
    .eq("is_active", true)
    .single();

  if (ruleError || !rule) {
    throw new Error(`Tax rule missing for ${taxRegime}/${standard}/${taxCode}`);
  }

  // 3. Calculate tax
  const taxAmount = Number(taxableAmount || 0) * Number(rule.tax_rate || 0);

  // 4. Store normalized calculation
  const { data, error } = await supabaseAdmin
    .from("tax_calculations")
    .insert({
      organization_id: organizationId,
      organization_id: organizationId,
      reference_type: referenceType,
      reference_id: referenceId,
      taxable_amount: taxableAmount,
      tax_amount: taxAmount,
      tax_rate: rule.tax_rate,
      tax_code: taxCode,
      tax_regime: taxRegime,
      accounting_standard: standard
    })
    .select()
    .single();

  if (error) throw error;

  return {
    success: true,
    taxAmount,
    rule,
    calculation: data
  };
}
