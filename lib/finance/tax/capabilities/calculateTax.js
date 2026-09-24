import { supabaseAdmin } from "@/lib/shared/supabase/admin";

/**
 * UNIFIED TAX ENGINE (TFRS + IFRS READY)
 * Single source of truth for all tax calculations
 */
export async function calculateTax({
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
  const normalizedTaxCode = String(taxCode || "").trim().toUpperCase();

  if (normalizedTaxCode.includes("VAT") && profile.vat_registered !== true) {
    throw new Error("VAT_NOT_REGISTERED");
  }

  // 2. Get tax rule (organization override first, then governed global reference)
  const today = new Date().toISOString().slice(0, 10);
  const { data: candidates, error: ruleError } = await supabaseAdmin
    .from("tax_rules")
    .select("*")
    .eq("tax_regime", taxRegime)
    .eq("accounting_standard", standard)
    .eq("tax_code", normalizedTaxCode)
    .eq("is_active", true)
    .or(`organization_id.eq.${organizationId},organization_id.is.null`);

  if (ruleError) throw ruleError;
  const effective = (candidates || []).filter((candidate) =>
    (!candidate.effective_from || candidate.effective_from <= today) &&
    (!candidate.effective_to || candidate.effective_to >= today)
  );
  const organizationRule = effective
    .filter((candidate) => candidate.organization_id === organizationId)
    .sort((left, right) => String(right.effective_from || "").localeCompare(String(left.effective_from || "")))[0];
  const globalRule = effective
    .filter((candidate) => !candidate.organization_id)
    .sort((left, right) => String(right.effective_from || "").localeCompare(String(left.effective_from || "")))[0];
  const rule = organizationRule || globalRule || null;

  if (!rule) {
    throw new Error(`Tax rule missing for ${taxRegime}/${standard}/${taxCode}`);
  }

  // 3. Calculate tax
  const taxAmount = Number(taxableAmount || 0) * Number(rule.tax_rate || 0);

  // 4. Store normalized calculation
  const { data, error } = await supabaseAdmin
    .from("tax_calculations")
    .insert({
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
