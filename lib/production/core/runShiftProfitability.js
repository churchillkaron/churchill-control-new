import { supabase } from "@/lib/supabase";

export async function runShiftProfitability({
  tenantId,
  shiftName,
  revenue,
  foodCost,
  laborCost,
}) {
  const grossProfit =
    Number(revenue || 0) -
    Number(foodCost || 0) -
    Number(laborCost || 0);

  const margin =
    revenue > 0
      ? (
          grossProfit /
          Number(revenue)
        ) * 100
      : 0;

  const { data, error } =
    await supabase
      .from("shift_profitability")
      .insert({
        tenant_id: tenantId,
        shift_name: shiftName,
        revenue,
        food_cost: foodCost,
        labor_cost: laborCost,
        gross_profit:
          grossProfit,
        net_margin: margin,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
