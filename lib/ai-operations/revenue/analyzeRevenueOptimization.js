import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function analyzeRevenueOptimization({
  tenant_id,
}) {

  try {

    const {
      data: sales,
      error,
    } = await supabaseAdmin
      .from("daily_sales_items")
      .select("*")
      .eq(
        "tenant_id",
        tenant_id
      );

    if (error) {
      throw error;
    }

    const revenue =
      (sales || []).reduce(
        (
          sum,
          item
        ) =>
          sum +
          (
            Number(
              item.price || 0
            ) *
            Number(
              item.quantity || 0
            )
          ),
        0
      );

    const orders =
      sales?.length || 0;

    const averageOrderValue =
      orders > 0
        ? revenue / orders
        : 0;

    return {

      success: true,

      revenue:
        Number(
          revenue.toFixed(2)
        ),

      orders,

      average_order_value:
        Number(
          averageOrderValue.toFixed(2)
        ),
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
