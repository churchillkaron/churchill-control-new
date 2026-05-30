import { supabase } from "@/lib/supabase";

export async function runRegulatoryReporting({
  tenantId,
  reportType,
  reportingPeriod,
}) {
  const { data: profitability } =
    await supabase
      .from(
        "profitability_snapshots"
      )
      .select("*")
      .eq("tenant_id", tenantId);

  const { data: tax } =
    await supabase
      .from(
        "tax_filing_records"
      )
      .select("*")
      .eq("tenant_id", tenantId);

  let revenue = 0;
  let profit = 0;
  let totalTax = 0;

  for (const row of profitability || []) {
    revenue += Number(
      row.revenue || 0
    );

    profit += Number(
      row.net_profit || 0
    );
  }

  for (const row of tax || []) {
    totalTax += Number(
      row.tax_amount || 0
    );
  }

  const { data, error } =
    await supabase
      .from(
        "regulatory_reporting_runs"
      )
      .insert({
        tenant_id: tenantId,
        report_type:
          reportType,
        reporting_period:
          reportingPeriod,
        total_revenue:
          revenue,
        total_tax:
          totalTax,
        net_profit:
          profit,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
