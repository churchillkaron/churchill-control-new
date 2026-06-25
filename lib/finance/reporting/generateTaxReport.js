import { supabaseAdmin } from "@/lib/shared/supabase/admin";

/**
 * TAX REPORT GENERATOR (FINAL LAYER)
 * Converts filings + calculations into accounting-firm reports
 */
export async function generateTaxReport({
  organizationId,
  tenantId,
  periodStart,
  periodEnd,
  reportType = "VAT_RETURN"
}) {

  if (!tenantId || !organizationId) {
    throw new Error("Missing tenant or organization");
  }

  // 1. Get accounting profile (TFRS / IFRS)
  const { data: profile } = await supabaseAdmin
    .from("organization_accounting_profiles")
    .select("*")
    .eq("organization_id", organizationId)
    .single();

  if (!profile) {
    throw new Error("Missing accounting profile");
  }

  // 2. Get tax filings in period
  const { data: filings } = await supabaseAdmin
    .from("tax_filings")
    .select("*")
    .eq("tenant_id", tenantId)
    .gte("created_at", periodStart)
    .lte("created_at", periodEnd);

  // 3. Aggregate VAT data
  let totalTaxPayable = 0;
  let totalTaxReceivable = 0;

  for (const f of filings || []) {
    totalTaxPayable += Number(f.tax_payable || 0);
    totalTaxReceivable += Number(f.tax_receivable || 0);
  }

  const netTax = totalTaxPayable - totalTaxReceivable;

  // 4. Store report
  const { data, error } = await supabaseAdmin
    .from("finance_tax_reports")
    .insert({
      organization_id: organizationId,
      tenant_id: tenantId,
      tax_regime: profile.tax_regime,
      accounting_standard: profile.accounting_standard,
      period_start: periodStart,
      period_end: periodEnd,
      report_type: reportType,
      sales_revenue: 0,
      purchases: 0,
      output_tax: totalTaxPayable,
      input_tax: totalTaxReceivable,
      tax_payable: netTax,
      status: "generated"
    })
    .select()
    .single();

  return {
    success: true,
    report: data
  };
}
