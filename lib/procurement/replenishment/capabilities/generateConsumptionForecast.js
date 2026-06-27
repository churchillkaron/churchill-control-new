import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function generateConsumptionForecast({
  ingredient_name,
  days = 30,
}) {

  try {

    const since =
      new Date();

    since.setDate(
      since.getDate() -
      Number(days || 30)
    );

    const {
      data,
      error,
    } = await supabaseAdmin
      .from(
        "inventory_ledger"
      )
      .select("*")
      .eq(
        "ingredient_name",
        ingredient_name
      )
      .in(
        "movement_type",
        [
          "CONSUMPTION",
          "PREPARED_CONSUMPTION",
        ]
      )
      .gte(
        "created_at",
        since.toISOString()
      );

    if (error) {
      throw error;
    }

    const totalConsumption =
      (data || []).reduce(
        (
          sum,
          row
        ) =>
          sum +
          Number(
            row.quantity || 0
          ),
        0
      );

    const avgDailyConsumption =
      totalConsumption /
      Number(days || 1);

    return {

      success: true,

      ingredient_name,

      days,

      total_consumption:
        Number(
          totalConsumption.toFixed(2)
        ),

      avg_daily_consumption:
        Number(
          avgDailyConsumption.toFixed(2)
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
