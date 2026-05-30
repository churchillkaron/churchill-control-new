import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function buildRevenueIntelligence({
  tenant_id,
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("daily_sales_items")
      .select("price, quantity")
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
          (
            Number(
              item.price || 0
            ) *
            Number(
              item.quantity || 1
            )
          ),
        0
      );

    const totalTransactions =
      data?.length || 0;

    const averageTransaction =
      totalTransactions > 0
        ? totalRevenue /
          totalTransactions
        : 0;

    let status =
      "HEALTHY";

    if (
      averageTransaction < 200
    ) {
      status =
        "LOW_AVERAGE_ORDER";
    }

    return {
      success: true,
      total_revenue:
        totalRevenue,
      total_transactions:
        totalTransactions,
      average_transaction:
        averageTransaction,
      revenue_status:
        status,
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
