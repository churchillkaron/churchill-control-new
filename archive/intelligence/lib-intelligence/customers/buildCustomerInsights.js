import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function buildCustomerInsights({
  tenant_id,
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("orders")
      .select("customer_name,total,status")
      .eq(
        "tenant_id",
        tenant_id
      );

    if (error) {
      throw error;
    }

    const totalCustomers =
      new Set(
        (data || []).map(
          (o) =>
            o.customer_name
        )
      ).size;

    const completedOrders =
      (data || []).filter(
        (o) =>
          o.status ===
          "completed"
      );

    const revenue =
      completedOrders.reduce(
        (sum, item) =>
          sum +
          Number(
            item.total || 0
          ),
        0
      );

    const avgSpend =
      totalCustomers > 0
        ? revenue /
          totalCustomers
        : 0;

    return {
      success: true,
      total_customers:
        totalCustomers,
      completed_orders:
        completedOrders.length,
      customer_revenue:
        revenue,
      average_customer_spend:
        avgSpend,
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
