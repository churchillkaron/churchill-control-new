import { supabase } from "@/lib/supabase";

export async function runShiftProfitability({
  organizationId,
  organization_id,
  entityId = null,
  entity_id = null,
  shiftName,
  revenue,
  foodCost,
  laborCost,
}) {
  const resolvedOrganizationId =
    organizationId || organization_id;

  const resolvedEntityId =
    entityId || entity_id || null;

  if (!resolvedOrganizationId) {
    throw new Error("organizationId required");
  }

  if (!resolvedEntityId) {
    throw new Error("entityId required");
  }

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
        organization_id: resolvedOrganizationId,
        entity_id: resolvedEntityId,
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
