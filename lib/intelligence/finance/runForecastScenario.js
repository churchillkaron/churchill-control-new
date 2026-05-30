import { supabase } from "@/lib/supabase";

export async function runForecastScenario({
  tenantId,
  scenarioName,
  revenueChangePercent,
  expenseChangePercent,
  baseProfit,
}) {
  const projectedImpact =
    Number(baseProfit || 0) *
    (
      Number(
        revenueChangePercent || 0
      ) /
        100 -
      Number(
        expenseChangePercent || 0
      ) /
        100
    );

  const { data, error } =
    await supabase
      .from(
        "financial_forecast_scenarios"
      )
      .insert({
        tenant_id: tenantId,
        scenario_name:
          scenarioName,
        revenue_change_percent:
          revenueChangePercent,
        expense_change_percent:
          expenseChangePercent,
        projected_profit_impact:
          projectedImpact,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
