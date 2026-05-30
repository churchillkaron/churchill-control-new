import { supabase } from "@/lib/supabase";

import { runLiquidityAnalysis } from "./runLiquidityAnalysis";
import { generateFinancialStatementsFromLedger } from "./generateFinancialStatementsFromLedger";

export async function runAccountingKPIs({
  tenantId,
  startDate,
  endDate,
}) {
  const liquidity =
    await runLiquidityAnalysis({
      tenantId,
    });

  const financials =
    await generateFinancialStatementsFromLedger({
      tenantId,
      startDate,
      endDate,
    });

  const revenue =
    Number(
      financials.profitLoss
        .revenue || 0
    );

  const expenses =
    Number(
      financials.profitLoss
        .expenses || 0
    );

  const netProfit =
    Number(
      financials.profitLoss
        .netProfit || 0
    );

  const grossMargin =
    revenue > 0
      ? (
          (revenue -
            expenses) /
          revenue
        ) * 100
      : 0;

  const netMargin =
    revenue > 0
      ? (
          netProfit /
          revenue
        ) * 100
      : 0;

  const { data, error } =
    await supabase
      .from(
        "accounting_kpi_snapshots"
      )
      .insert({
        tenant_id: tenantId,
        current_ratio:
          liquidity.current_ratio,
        quick_ratio:
          liquidity.quick_ratio,
        gross_margin:
          grossMargin,
        net_margin:
          netMargin,
        operating_cashflow:
          netProfit,
        working_capital:
          liquidity.working_capital,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
