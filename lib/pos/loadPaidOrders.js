import { supabase } from "@/lib/shared/supabase/client";

function tableReference(table) {
  return (
    table?.table_number ||
    table?.table_name ||
    null
  );
}

export async function loadPaidOrders(
  organizationId
) {
  if (!organizationId) {
    return [];
  }

  const orderResult = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq(
      "organization_id",
      organizationId
    )
    .or(
      "payment_status.eq.PAID,status.eq.PAID"
    )
    .order(
      "paid_at",
      {
        ascending: false,
      }
    );

  if (orderResult.error) {
    console.error(
      "LOAD PAID ORDERS ERROR",
      orderResult.error
    );

    return [];
  }

  const orders =
    orderResult.data || [];

  const tableIds = [
    ...new Set(
      orders
        .map((order) => order.table_id)
        .filter(Boolean)
    ),
  ];

  let tables = [];

  if (tableIds.length) {
    const tableResult = await supabase
      .from("restaurant_tables")
      .select(
        "id, table_number, table_name"
      )
      .eq(
        "organization_id",
        organizationId
      )
      .in("id", tableIds);

    if (tableResult.error) {
      console.error(
        "LOAD PAID ORDER TABLES ERROR",
        tableResult.error
      );

      return [];
    }

    tables =
      tableResult.data || [];
  }

  const tableById = new Map(
    tables.map((table) => [
      table.id,
      table,
    ])
  );

  return orders.map((order) => {
    const table =
      tableById.get(order.table_id) ||
      null;

    const reference =
      tableReference(table);

    return {
      ...order,

      items:
        Array.isArray(order.order_items)
          ? order.order_items
          : [],

      table_reference:
        reference,

      context: {
        type:
          "service_location",

        id:
          table?.id ||
          order.table_id ||
          null,

        reference:
          reference == null
            ? null
            : String(reference),

        label:
          reference == null
            ? "Unassigned service location"
            : `Table ${reference}`,
      },
    };
  });
}
