import { supabase } from "@/lib/supabase";

export async function runLaborCosting({
  tenantId,
  department,
  laborHours,
  averageHourlyRate,
  revenueGenerated,
}) {
  const laborCost =
    Number(laborHours || 0) *
    Number(averageHourlyRate || 0);

  const laborPercentage =
    revenueGenerated > 0
      ? (
          laborCost /
          Number(revenueGenerated)
        ) * 100
      : 0;

  const { data, error } =
    await supabase
      .from(
        "labor_cost_snapshots"
      )
      .insert({
        tenant_id: tenantId,
        department,
        labor_hours:
          laborHours,
        labor_cost:
          laborCost,
        revenue_generated:
          revenueGenerated,
        labor_percentage:
          laborPercentage,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
