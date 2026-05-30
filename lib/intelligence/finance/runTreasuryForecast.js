import { supabase } from "@/lib/supabase";

export async function runTreasuryForecast({
  tenantId,
  forecastPeriod,
}) {
  const { data: accounts } =
    await supabase
      .from("bank_accounts")
      .select("*")
      .eq("tenant_id", tenantId);

  const { data: payables } =
    await supabase
      .from("ap_subledger")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("status", "open");

  const { data: receivables } =
    await supabase
      .from("ar_subledger")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("status", "open");

  let openingCash = 0;
  let projectedInflows = 0;
  let projectedOutflows = 0;

  for (const account of accounts || []) {
    openingCash += Number(
      account.current_balance || 0
    );
  }

  for (const row of receivables || []) {
    projectedInflows += Number(
      row.outstanding_amount || 0
    );
  }

  for (const row of payables || []) {
    projectedOutflows += Number(
      row.outstanding_amount || 0
    );
  }

  const projectedClosing =
    openingCash +
    projectedInflows -
    projectedOutflows;

  const { data, error } =
    await supabase
      .from(
        "treasury_cash_forecasts"
      )
      .insert({
        tenant_id: tenantId,
        forecast_period:
          forecastPeriod,
        opening_cash:
          openingCash,
        projected_inflows:
          projectedInflows,
        projected_outflows:
          projectedOutflows,
        projected_closing_cash:
          projectedClosing,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
