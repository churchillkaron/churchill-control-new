import { supabaseAdmin } from "@/lib/shared/supabase/admin";

/**
 * PP30 Thailand VAT Report Generator
 */
export async function generatePP30({
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

  let outputVAT = 0;
  let inputVAT = 0;

  for (const f of filings || []) {
    outputVAT += Number(f.tax_payable || 0);
    inputVAT += Number(f.tax_receivable || 0);
  }

  const netVAT = outputVAT - inputVAT;

  return {
    form: "PP30",
    periodStart,
    periodEnd,
    outputVAT,
    inputVAT,
    netVAT,
    currency: "THB",
    status: "DRAFT"
  };
}
