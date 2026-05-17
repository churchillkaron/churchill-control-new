import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function buildRevenueTrends({
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
      )
      .order(
        "created_at",
        {
          ascending: true,
        }
      );

    if (error) {
      throw error;
    }

    const grouped = {};

    for (const item of data || []) {

      const date =
        new Date(
          item.created_at
        )
        .toISOString()
        .split("T")[0];

      if (!grouped[date]) {
        grouped[date] = 0;
      }

      grouped[date] +=
        Number(
          item.price || 0
        );
    }

    const trends =
      Object.entries(
        grouped
      ).map(
        ([date, revenue]) => ({
          date,
          revenue,
        })
      );

    return {
      success: true,
      trends,
    };

  } catch (error) {

    return {
      success: false,
      error:
        error.message,
    };
  }
}
