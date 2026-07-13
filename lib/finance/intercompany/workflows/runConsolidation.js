import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import { generateConsolidatedReport } from "@/lib/finance/reporting/reports/core/generateConsolidatedReport";

export async function runConsolidation({
  parentOrganizationId,
  organizationIds,
  reportingPeriod,
  startDate,
  endDate,
}) {
  const report =
    await generateConsolidatedReport({
      organizationIds,
      startDate,
      endDate,
    });

  const {
    balanceSheet,
    profitLoss,
  } = report;

  const { data, error } =
    await supabaseAdmin
      .from("consolidation_runs")
      .insert({
        parent_organization_id:
          parentOrganizationId,
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
