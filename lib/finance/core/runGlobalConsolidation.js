import { supabase } from "@/lib/supabase";

export async function runGlobalConsolidation({
  tenantId,
  consolidationPeriod,
}) {
  const { data: profitability } =
    await supabase
      .from(
        "profitability_snapshots"
      )
      .select("*")
      .eq("tenant_id", tenantId);

  const { data: eliminations } =
    await supabase
      .from(
        "consolidation_eliminations"
      )
      .select("*")
      .eq("tenant_id", tenantId);

  let revenue = 0;
  let profit = 0;

  for (const row of profitability || []) {
    revenue += Number(
      row.revenue || 0
    );

    profit += Number(
      row.net_profit || 0
    );
  }

  let eliminationTotal = 0;

  for (const row of eliminations || []) {
    eliminationTotal += Number(
      row.elimination_amount || 0
    );
  }

  const consolidatedRevenue =
    revenue - eliminationTotal;

  const consolidatedProfit =
    profit - eliminationTotal;

  const { data, error } =
    await supabase
      .from("consolidation_runs")
      .insert({
        tenant_id: tenantId,
        consolidation_period:
          consolidationPeriod,
        total_entities: 1,
        consolidated_revenue:
          consolidatedRevenue,
        consolidated_profit:
          consolidatedProfit,
        fx_adjustment: 0,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
