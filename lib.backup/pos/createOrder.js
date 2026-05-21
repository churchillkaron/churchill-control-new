import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function createOrder(payload) {

  const {
    tenantId,
    tableNumber,
    staffId,
    staffName,
    items,
  } = payload;

  if (!tableNumber) {
    throw new Error(
      "Table required"
    );
  }

  if (!items?.length) {
    throw new Error(
      "No items"
    );
  }

  // ===== FIND EXISTING OPEN ORDER =====
  let activeOrder = null;

  const {
    data: existingOrders,
    error: existingError,
  } = await supabaseAdmin

    .from("orders")

    .select("*")

    .eq(
      "tenant_id",
      tenantId
    )

    .eq(
      "table_number",
      tableNumber
    )

    .in(
      "status",
      ["OPEN", "BILLING"]
    )

    .order(
      "created_at",
      {
        ascending: false,
      }
    )

    .limit(1);

  if (existingError) {
    throw existingError;
  }

  if (
    existingOrders &&
    existingOrders.length
  ) {

    activeOrder =
      existingOrders[0];
  }

  // ===== CREATE ORDER =====
  if (!activeOrder) {

    const {
      data: newOrder,
      error: orderError,
    } = await supabaseAdmin

      .from("orders")

      .insert({

        tenant_id:
          tenantId,

        table_number:
          tableNumber,

        staff_id:
          staffId,

        staff_name:
          staffName,

        status:
          "OPEN",

        payment_status:
          "UNPAID",

        kitchen_status:
          "PENDING",

        total_amount: 0,

      })

      .select()

      .single();

    if (orderError) {
      throw orderError;
    }

    activeOrder =
      newOrder;
  }

  // ===== INSERT ITEMS =====
  const itemsPayload =
    items.map(item => ({

      order_id:
        activeOrder.id,

      dish_id:
        item.dish_id,

      item_name:
        item.item_name,

      quantity:
        item.quantity,

      price:
        item.price,

      station:
        item.station || "HOT",

      status:
        "PENDING",

    }));

  const {
    error: itemsError,
  } = await supabaseAdmin

    .from("order_items")

    .insert(itemsPayload);

  if (itemsError) {
    throw itemsError;
  }

  // ===== UPDATE TOTAL =====
  const orderTotal =
    items.reduce(
      (sum, item) =>

        sum +

        Number(item.price || 0) *

        Number(item.quantity || 1),

      0
    );

  await supabaseAdmin

    .from("orders")

    .update({

      total_amount:

        Number(
          activeOrder.total_amount || 0
        ) +

        orderTotal,

    })

    .eq(
      "id",
      activeOrder.id
    );

  // ===== SET TABLE ACTIVE =====
  await supabaseAdmin

    .from("restaurant_tables")

    .update({

      status:
        "OCCUPIED",

    })

    .eq(
      "table_name",
      tableNumber
    );

  return {

    success: true,

    orderId:
      activeOrder.id,

  };
}
