import { supabase } from "@/lib/shared/supabase/client";

import { triggerProduction } from "@/lib/production/triggerProduction";

export async function completeOrderFlow(
  order_id,
  tenant_id
) {

  if (
    !order_id ||
    !tenant_id
  ) {

    return {
      success: false,
    };
  }

  // ===== COMPLETE ORDER =====
  const {
    data: order,
    error,
  } = await supabase
    .from("orders")
    .update({

      status: "PAID",

      completed_at:
        new Date().toISOString(),
    })
    .eq(
      "id",
      order_id
    )
    .select()
    .single();

  if (
    error ||
    !order
  ) {

    console.error(
      error
    );

    return {
      success: false,
    };
  }

  // ===== TRIGGER PRODUCTION =====
  await triggerProduction(
    order_id,
    tenant_id
  );

  return {

    success: true,

    order,
  };
}
