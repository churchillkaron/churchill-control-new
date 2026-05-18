import { supabase }
from "@/lib/shared/supabase/client";

export async function loadActiveOrders(
  tenantId
) {

  const {
    data,
    error,
  } = await supabase

    .from("orders")

    .select(`
      *,
      kitchen_ticket_items (
        id,
        status
      )
    `)

    .eq(
      "tenant_id",
      tenantId
    )

    .neq(
      "payment_status",
      "PAID"
    )

    .order(
      "created_at",
      {
        ascending: false,
      }
    );

  if (error) {

    console.error(error);

    return [];
  }

  return (
    data || []
  ).map((order) => {

    const items =
      order.kitchen_ticket_items || [];

    const allReady =
      items.length > 0 &&
      items.every(
        (item) =>
          item.status === "READY" ||
          item.status === "SERVED"
      );

    return {

      ...order,

      canServe:
        allReady,

      canPay:
        allReady,
    };
  });
}
