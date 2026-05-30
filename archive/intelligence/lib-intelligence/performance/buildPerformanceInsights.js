import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function buildPerformanceInsights({
  tenant_id,
}) {

  try {

    const {
      data: orders,
      error,
    } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq(
        "tenant_id",
        tenant_id
      );

    if (error) {
      throw error;
    }

    const totalOrders =
      orders?.length || 0;

    const completedOrders =
      (orders || []).filter(
        (o) =>
          o.status ===
          "completed"
      ).length;

    const completionRate =
      totalOrders > 0
        ? (
            completedOrders /
            totalOrders
          ) * 100
        : 0;

    let performance =
      "GOOD";

    if (
      completionRate < 80
    ) {
      performance =
        "WARNING";
    }

    if (
      completionRate < 50
    ) {
      performance =
        "CRITICAL";
    }

    return {
      success: true,
      total_orders:
        totalOrders,
      completed_orders:
        completedOrders,
      completion_rate:
        completionRate,
      performance,
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
