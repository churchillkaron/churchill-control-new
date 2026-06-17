import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function generateFinancialForecast({
  tenant_id,
}) {

  try {

    const {
      data: ledger,
      error,
    } = await supabaseAdmin
      .from("general_ledger")
      .select("*")
      .eq(
        "tenant_id",
        tenant_id
      );

    if (error) {
      throw error;
    }

    const monthlyAverage =
      (ledger || []).reduce(
        (
          sum,
          row
        ) =>
          sum +
          Number(
            row.amount || 0
          ),
        0
      ) / 12;

    const projectedYearly =
      monthlyAverage * 12;

    return {

      success: true,

      monthly_average:
        Number(
          monthlyAverage.toFixed(2)
        ),

      projected_yearly:
        Number(
          projectedYearly.toFixed(2)
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
