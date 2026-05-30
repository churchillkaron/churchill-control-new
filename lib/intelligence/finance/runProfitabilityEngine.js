import { supabase } from "@/lib/supabase";

export async function runProfitabilityEngine({
  tenantId,
  referenceType,
  referenceId,
  revenue,
  cogs,
  laborCost,
  overheadCost,
}) {
  const grossProfit =
    Number(revenue || 0) -
    Number(cogs || 0);

  const netProfit =
    grossProfit -
    Number(laborCost || 0) -
    Number(overheadCost || 0);

  const margin =
    revenue > 0
      ? (
          netProfit /
          Number(revenue)
        ) * 100
      : 0;

  const { data, error } =
    await supabase
      .from(
        "profitability_snapshots"
      )
      .insert({
        tenant_id: tenantId,
        reference_type:
          referenceType,
        reference_id:
          referenceId,
        revenue,
        cogs,
        labor_cost:
          laborCost,
        overhead_cost:
          overheadCost,
        gross_profit:
          grossProfit,
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
