import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function buildRevenueForecast({
  tenant_id,
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("daily_sales_items")
      .select("price")
      .eq(
        "tenant_id",
        tenant_id
      );

    if (error) {
      throw error;
    }

    const revenues =
      (data || []).map(
        (item) =>
          Number(
            item.price || 0
          )
      );

    const totalRevenue =
      revenues.reduce(
        (sum, value) =>
          sum + value,
        0
      );

    const avgRevenue =
      revenues.length > 0
        ? totalRevenue /
          revenues.length
        : 0;

    const projected30Day =
      avgRevenue * 30;

    return {
      success: true,
      average_daily_revenue:
        avgRevenue,
      projected_30_day_revenue:
        projected30Day,
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
