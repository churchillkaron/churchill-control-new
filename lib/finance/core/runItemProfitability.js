import { supabase } from "@/lib/supabase";

export async function runItemProfitability({
  tenantId,
  itemId,
}) {
  const { data: cogs } =
    await supabase
      .from("cogs_postings")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("item_id", itemId);

  let revenue = 0;
  let cost = 0;

  for (const row of cogs || []) {
    revenue += Number(
      row.revenue_amount || 0
    );

    cost += Number(
      row.cogs_amount || 0
    );
  }

  const laborCost =
    revenue * 0.18;

  const overheadCost =
    revenue * 0.10;

  const netProfit =
    revenue -
    cost -
    laborCost -
    overheadCost;

  const margin =
    revenue > 0
      ? (netProfit / revenue) *
        100
      : 0;

  const { data, error } =
    await supabase
      .from(
        "profitability_snapshots"
      )
      .insert({
        tenant_id: tenantId,
        profitability_type:
          "ITEM",
        reference_id: itemId,
        revenue,
        cogs: cost,
        labor_cost:
          laborCost,
        overhead_cost:
          overheadCost,
        net_profit:
          netProfit,
        net_margin: margin,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
