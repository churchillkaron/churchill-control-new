import { supabase } from "@/lib/supabase";

export async function runFinancialForecast({
  tenantId,
  forecastPeriod,
}) {
  const profitability =
    await supabase
      .from(
        "profitability_snapshots"
      )
      .select("*")
      .eq("tenant_id", tenantId);

  let revenue = 0;
  let expenses = 0;
  let count = 0;

  for (const row of profitability.data || []) {
    revenue += Number(
      row.revenue || 0
    );

    expenses +=
      Number(row.cogs || 0) +
      Number(
        row.labor_cost || 0
      ) +
      Number(
        row.overhead_cost || 0
      );

    count++;
  }

  const averageRevenue =
    count > 0
      ? revenue / count
      : 0;

  const averageExpenses =
    count > 0
      ? expenses / count
      : 0;

  const projectedProfit =
    averageRevenue -
    averageExpenses;

  const { data, error } =
    await supabase
      .from(
        "financial_forecasts"
      )
      .insert({
        tenant_id: tenantId,
        forecast_period:
          forecastPeriod,
        projected_revenue:
          averageRevenue,
        projected_expenses:
          averageExpenses,
        projected_profit:
          projectedProfit,
        forecast_confidence:
          count > 30 ? 90 : 60,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
