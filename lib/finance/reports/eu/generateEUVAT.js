import { supabaseAdmin } from "@/lib/shared/supabase/admin";

/**
 * EU VAT Return Generator
 */
export async function generateEUVAT({
  tenantId,
  periodStart,
  periodEnd
}) {

  const { data: filings } = await supabaseAdmin
    .from("tax_filings")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("filing_type", "VAT")
    .gte("period_start", periodStart)
    .lte("period_end", periodEnd);

  let vatDue = 0;
  let vatDeductible = 0;

  for (const f of filings || []) {
    vatDue += Number(f.tax_payable || 0);
    vatDeductible += Number(f.tax_receivable || 0);
  }

  return {
    form: "EU_VAT_RETURN",
    periodStart,
    periodEnd,
    vatDue,
    vatDeductible,
    netVAT: vatDue - vatDeductible,
    currency: "EUR",
    status: "DRAFT"
  };
}
