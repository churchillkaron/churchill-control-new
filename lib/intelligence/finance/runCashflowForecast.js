import { supabase } from "@/lib/supabase";

export async function runCashflowForecast({
  tenantId,
  period,
}) {
  const { data: cashflows } =
    await supabase
      .from("bank_transactions")
      .select("*")
      .eq("tenant_id", tenantId);

  let inflow = 0;
  let outflow = 0;

  for (const row of cashflows || []) {
    const amount =
      Number(row.amount || 0);

    if (row.type === "deposit") {
      inflow += amount;
    }

    if (
      row.type === "withdrawal"
    ) {
      outflow += amount;
    }
  }

  const projectedInflow =
    inflow * 1.08;

  const projectedOutflow =
    outflow * 1.04;

  const projectedNet =
    projectedInflow -
    projectedOutflow;

  const { data, error } =
    await supabase
      .from("cashflow_forecasts")
      .insert({
        tenant_id: tenantId,
        forecast_period: period,
        projected_inflow:
          projectedInflow,
        projected_outflow:
          projectedOutflow,
        projected_net_cashflow:
          projectedNet,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
