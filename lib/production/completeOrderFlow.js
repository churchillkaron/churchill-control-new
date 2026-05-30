import { supabaseAdmin } from "@/lib/shared/supabase/admin";

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
  } = await supabaseAdmin
    .from("orders")
    .update({

      status: "CLOSED",

      completed_at:
        new Date().toISOString(),
    })
    .eq(
      "id",
      order_id
    )
    .eq(
      "tenant_id",
      tenant_id
    )
    .select()
    .single();

  if (
    error ||
    !order
  ) {

    console.error(error);

    return {
      success: false,
      error:
        error?.message ||
        "ORDER_COMPLETION_FAILED",
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
