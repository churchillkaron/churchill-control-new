import { supabase } from "@/lib/supabase";

export async function calculateShiftPerformance({
  tenantId,
  shiftName,
  department,
  revenue,
  laborHours,
  orders,
}) {
  const revenuePerHour =
    laborHours > 0
      ? Number(revenue) /
        Number(laborHours)
      : 0;

  const averageTicket =
    orders > 0
      ? Number(revenue) /
        Number(orders)
      : 0;

  const score =
    (
      revenuePerHour * 0.6 +
      averageTicket * 0.4
    ) / 10;

  const { data, error } =
    await supabase
      .from(
        "shift_performance_scores"
      )
      .insert({
        tenant_id: tenantId,
        shift_name: shiftName,
        department,
        performance_score:
          score,
        revenue_per_labor_hour:
          revenuePerHour,
        average_ticket:
          averageTicket,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
