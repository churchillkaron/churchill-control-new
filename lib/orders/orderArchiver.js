import {
  canArchiveOrder,
} from "./orderCompletion";

export async function archiveOrder(
  supabase,
  order
) {

  const allowed =
    canArchiveOrder(
      order
    );

  if (!allowed) {

    return {
      archived: false,
    };

  }

  await supabase

    .from("orders")

    .update({

      archived: true,

      archived_at:
        new Date().toISOString(),

    })

    .eq(
      "id",
      order.id
    );

  await supabase

    .from(
      "restaurant_tables"
    )

    .update({

      status:
        "AVAILABLE",

    })

    .eq(
      "table_name",
      order.table_number
    );

  return {

    archived: true,

  };

}
