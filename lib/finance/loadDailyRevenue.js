import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/shared/supabase/client";

export async function loadDailyRevenue(
  tenant_id
) {

  if (!tenant_id) {
    return 0;
  }

  const today =
    new Date();

  today.setHours(
    0,
    0,
    0,
    0
  );

  const {
    data,
    error,
  } = await supabase
    .from("orders")
    .select("*")
    .eq(
      "tenant_id",
      tenant_id
    )
    .eq(
      "status",
      "PAID"
    )
    .gte(
      "paid_at",
      today.toISOString()
    );

  if (error) {

    console.error(
      "DAILY REVENUE ERROR",
      error
    );

    return 0;
  }

  return (
    data || []
  ).reduce(
    (
      sum,
      order
    ) =>
      sum +
      Number(
        order.total_amount || 0
      ),
    0
  );
}
