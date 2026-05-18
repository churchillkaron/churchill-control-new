import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export async function updateKitchenItemStatus(
  itemId,
  status
) {

  const {
    data: item,
    error: itemError,
  } = await supabaseAdmin

    .from(
      "kitchen_ticket_items"
    )

    .update({
      status,
    })

    .eq(
      "id",
      itemId
    )

    .select("*")

    .single();

  if (itemError) {
    throw itemError;
  }

  const {
    data: remaining,
  } = await supabaseAdmin

    .from(
      "kitchen_ticket_items"
    )

    .select("*")

    .eq(
      "order_id",
      item.order_id
    )

    .neq(
      "status",
      "SERVED"
    );

  const allServed =
    !remaining ||
    remaining.length === 0;

  if (allServed) {

    await supabaseAdmin

      .from("orders")

      .update({

        kitchen_status:
          "served",

        production_status:
          "completed",
      })

      .eq(
        "id",
        item.order_id
      );

    await supabaseAdmin

      .from(
        "table_sessions"
      )

      .update({

        status:
          "READY",
      })

      .eq(
        "table_number",
        item.table_number
      );
  }

  return item;
}
