import { supabase } from "@/lib/supabase";

import { generateConsolidatedReport } from "./generateConsolidatedReport";

export async function runConsolidation({
  parentTenantId,
  tenantIds,
  reportingPeriod,
  startDate,
  endDate,
}) {
  const report =
    await generateConsolidatedReport({
      tenantIds,
      startDate,
      endDate,
    });

  const {
    balanceSheet,
    profitLoss,
  } = report;

  const { data, error } =
    await supabase
      .from("consolidation_runs")
      .insert({
        parent_tenant_id:
          parentTenantId,
        reporting_period:
          reportingPeriod,
        total_assets:
          balanceSheet.assets,
        total_liabilities:
          balanceSheet.liabilities,
        total_equity:
          balanceSheet.equity,
        total_revenue:
          profitLoss.revenue,
        total_expenses:
          profitLoss.expenses,
        total_profit:
          profitLoss.netProfit,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return {
    consolidation: data,
    report,
  };
}
