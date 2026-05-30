import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function buildOperationalHealth({
  tenant_id,
}) {

  try {

    const [
      ordersResult,
      wasteResult,
      alertsResult,
    ] = await Promise.all([

      supabaseAdmin
        .from("orders")
        .select("status")
        .eq(
          "tenant_id",
          tenant_id
        ),

      supabaseAdmin
        .from("waste_logs")
        .select("cost")
        .eq(
          "tenant_id",
          tenant_id
        ),

      supabaseAdmin
        .from("approval_requests")
        .select("status")
        .eq(
          "tenant_id",
          tenant_id
        )
        .eq(
          "status",
          "pending"
        ),
    ]);

    const orders =
      ordersResult.data || [];

    const waste =
      wasteResult.data || [];

    const alerts =
      alertsResult.data || [];

    const completed =
      orders.filter(
        (o) =>
          o.status ===
          "completed"
      ).length;

    const completionRate =
      orders.length > 0
        ? (
            completed /
            orders.length
          ) * 100
        : 0;

    const wasteCost =
      waste.reduce(
        (sum, item) =>
          sum +
          Number(
            item.cost || 0
          ),
        0
      );

    let status =
      "HEALTHY";

    if (
      completionRate < 75
    ) {
      status =
        "WARNING";
    }

    if (
      completionRate < 50
    ) {
      status =
        "CRITICAL";
    }

    return {
      success: true,
      status,
      completion_rate:
        completionRate,
      waste_cost:
        wasteCost,
      pending_approvals:
        alerts.length,
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
