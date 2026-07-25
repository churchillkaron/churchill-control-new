import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveConsolidationContext } from "@/lib/finance/consolidation/resolveConsolidationContext";
import { generateConsolidatedReport } from "@/lib/finance/reporting/reports/core/generateConsolidatedReport";

export async function runConsolidation({
  organizationId,
  entityIds,
  periodId = null,
  reportingPeriod = null,
  startDate = null,
  endDate = null,
} = {}) {
  const context = await resolveConsolidationContext({
    organizationId,
    entityIds,
    periodId,
    startDate,
    endDate,
  });

  const report = await generateConsolidatedReport({
    organizationId: context.organizationId,
    entities: context.entities,
    startDate: context.startDate,
    endDate: context.endDate,
    currency: context.currency,
  });

  const { balanceSheet, profitLoss } = report;

  const { data, error } = await supabaseAdmin
    .from("consolidation_runs")
    .insert({
      parent_organization_id: context.organizationId,
      reporting_period:
        context.period?.name ||
        reportingPeriod ||
        [context.startDate, context.endDate].join(" – "),
      total_assets: balanceSheet.assets,
      total_liabilities: balanceSheet.liabilities,
      total_equity: balanceSheet.equity,
      total_revenue: profitLoss.revenue,
      total_expenses: profitLoss.cogs + profitLoss.expenses,
      total_profit: profitLoss.netProfit,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return {
    consolidation: data,
    context: {
      organizationId: context.organizationId,
      entityIds: context.entityIds,
      periodId: context.periodId,
      startDate: context.startDate,
      endDate: context.endDate,
      currency: context.currency,
    },
    report,
  };
}
