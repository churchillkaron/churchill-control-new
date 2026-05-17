import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function buildDemandForecast({
  tenant_id,
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("orders")
      .select("created_at")
      .eq(
        "tenant_id",
        tenant_id
      );

    if (error) {
      throw error;
    }

    const totalOrders =
      data?.length || 0;

    const projectedWeeklyOrders =
      Math.round(
        totalOrders * 1.15
      );

    const projectedMonthlyOrders =
      projectedWeeklyOrders * 4;

    let demand =
      "NORMAL";

    if (
      projectedMonthlyOrders > 1000
    ) {
      demand =
        "HIGH";
    }

    return {
      success: true,
      current_orders:
        totalOrders,
      projected_weekly_orders:
        projectedWeeklyOrders,
      projected_monthly_orders:
        projectedMonthlyOrders,
      demand_status:
        demand,
      generated_at:
        new Date().toISOString(),
    };

  } catch (error) {

    return {
      success: false,
      error:
        error.message,
    };
  }
}
