import { supabase } from "@/lib/supabase";

export async function allocateLaborCost({
  tenantId,
  shiftName,
  department,
  laborCost,
  revenue,
}) {
  const percent =
    revenue > 0
      ? (
          Number(laborCost) /
          Number(revenue)
        ) * 100
      : 0;

  const { data, error } =
    await supabase
      .from(
        "labor_cost_allocations"
      )
      .insert({
        tenant_id: tenantId,
        shift_name: shiftName,
        department,
        labor_cost: laborCost,
        revenue,
        labor_percent:
          percent,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
