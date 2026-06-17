import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function recognizeDeferredRevenue({
  tenantId,
  scheduleId,
  recognitionAmount,
}) {
  const existing =
    await supabase
      .from(
        "deferred_revenue_schedules"
      )
      .select("*")
      .eq("id", scheduleId)
      .single();

  if (!existing.data) {
    throw new Error(
      "Deferred revenue schedule missing"
    );
  }

  const recognized =
    Number(
      existing.data
        .recognized_amount || 0
    ) +
    Number(
      recognitionAmount || 0
    );

  const remaining =
    Number(
      existing.data
        .total_contract_value ||
        0
    ) - recognized;

  const status =
    remaining <= 0
      ? "completed"
      : "active";

  const { data, error } =
    await supabase
      .from(
        "deferred_revenue_schedules"
      )
      .update({
        recognized_amount:
          recognized,
        remaining_balance:
          remaining,
        recognition_status:
          status,
      })
      .eq("id", scheduleId)
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
