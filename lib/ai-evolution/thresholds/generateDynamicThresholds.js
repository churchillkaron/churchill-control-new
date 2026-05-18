import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function generateDynamicThresholds({
  tenant_id,
}) {

  try {

    const {
      data: operations,
    } = await supabaseAdmin
      .from("ai_operations_memory")
      .select("*")
      .eq(
        "tenant_id",
        tenant_id
      );

    const {
      data: finance,
    } = await supabaseAdmin
      .from("ai_finance_memory")
      .select("*")
      .eq(
        "tenant_id",
        tenant_id
      );

    const operationAverage =
      (operations || []).reduce(
        (
          sum,
          row
        ) =>
          sum +
          Number(
            row.metric_value || 0
          ),
        0
      ) /
      Math.max(
        operations?.length || 1,
        1
      );

    const financeAverage =
      (finance || []).reduce(
        (
          sum,
          row
        ) =>
          sum +
          Number(
            row.metric_value || 0
          ),
        0
      ) /
      Math.max(
        finance?.length || 1,
        1
      );

    return {

      success: true,

      thresholds: {

        kitchen_efficiency:
          Number(
            (
              operationAverage * 0.9
            ).toFixed(2)
          ),

        cashflow_warning:
          Number(
            (
              financeAverage * 0.75
            ).toFixed(2)
          ),
      },
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
