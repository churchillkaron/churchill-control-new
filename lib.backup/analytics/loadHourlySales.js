import { supabase } from "@/lib/shared/supabase/client";

export async function loadHourlySales(
  tenant_id
) {

  if (!tenant_id) {
    return [];
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
      "HOURLY SALES ERROR",
      error
    );

    return [];
  }

  const hourly = {};

  for (let i = 0; i < 24; i++) {

    hourly[i] = 0;
  }

  for (const order of data || []) {

    const hour =
      new Date(
        order.paid_at
      ).getHours();

    hourly[hour] +=
      Number(
        order.total_amount || 0
      );
  }

  return Object.entries(
    hourly
  ).map(
    ([
      hour,
      revenue,
    ]) => ({
      hour,
      revenue,
    })
  );
}
