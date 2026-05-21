import { supabase } from "@/lib/shared/supabase/client";

export async function loadServiceChargeStats(
  tenant_id
) {

  if (!tenant_id) {
    return null;
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
      "SERVICE CHARGE ERROR",
      error
    );

    return null;
  }

  const revenue =
    (data || []).reduce(
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

  const serviceCharge =
    revenue * 0.05;

  const foh =
    serviceCharge * 0.5;

  const bar =
    serviceCharge * 0.3;

  const kitchen =
    serviceCharge * 0.2;

  return {

    revenue,

    serviceCharge,

    foh,

    bar,

    kitchen,
  };
}
