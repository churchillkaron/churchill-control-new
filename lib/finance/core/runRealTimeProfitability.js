import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function runRealTimeProfitability({
  tenantId,
}) {
  const { data: profitability } =
    await supabase
      .from(
        "profitability_snapshots"
      )
      .select("*")
      .eq("tenant_id", tenantId);

  const { data: labor } =
    await supabase
      .from(
        "labor_cost_snapshots"
      )
      .select("*")
      .eq("tenant_id", tenantId);

  let revenue = 0;
  let cogs = 0;
  let laborCost = 0;
  let netProfit = 0;

  for (const row of profitability || []) {
    revenue += Number(
      row.revenue || 0
    );

    cogs += Number(
      row.cogs || 0
    );

    netProfit += Number(
      row.net_profit || 0
    );
  }

  for (const row of labor || []) {
    laborCost += Number(
      row.labor_cost || 0
    );
  }

  const finalProfit =
    netProfit - laborCost;

  const finalMargin =
    revenue > 0
      ? (
          finalProfit /
          revenue
        ) * 100
      : 0;

  return {
    revenue,
    cogs,
    laborCost,
    finalProfit,
    finalMargin,
  };
}
