import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function buildRevenueAnalytics({
  tenant_id,
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("daily_sales_items")
      .select("price, created_at")
      .eq(
        "tenant_id",
        tenant_id
      );

    if (error) {
      throw error;
    }

    const totalRevenue =
      (data || []).reduce(
        (sum, item) =>
          sum +
          Number(
            item.price || 0
          ),
        0
      );

    const totalOrders =
      data?.length || 0;

    const averageOrderValue =
      totalOrders > 0
        ? totalRevenue /
          totalOrders
        : 0;

    return {
      success: true,
      total_revenue:
        totalRevenue,
      total_orders:
        totalOrders,
      average_order_value:
        averageOrderValue,
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
