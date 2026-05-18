import { supabase } from "@/lib/shared/supabase/client";

export async function createOrder({
  table,
  items,
  total,
  staff_id,
  staff_name,
  tenant_id,
}) {

  // ===== CREATE ORDER =====
  const {
    data: order,
    error: orderError,
  } = await supabase
    .from("orders")
    .insert({
      table_number: table,
      total_amount: total,
      status: "ACTIVE",
      staff_id,
      staff_name,
      tenant_id,
    })
    .select()
    .single();

  if (orderError) {

    console.error(
      "ORDER ERROR",
      orderError
    );

    throw orderError;
  }

  // ===== ORDER ITEMS =====
  const orderItems =
    items.map((item) => ({
      order_id: order.id,
      dish_id: item.dish_id,
      item_name: item.item_name,
      quantity: item.quantity,
      price: item.price,
      tenant_id,
    }));

  const {
    data: insertedItems,
    error: itemError,
  } = await supabase
    .from("order_items")
    .insert(orderItems)
    .select();

  if (itemError) {

    console.error(
      "ITEM ERROR",
      itemError
    );

    throw itemError;
  }

  // ===== KITCHEN TICKET =====
  const {
    data: kitchenTicket,
    error: kitchenError,
  } = await supabase
    .from("kitchen_tickets")
    .insert({
      tenant_id,
      order_id: order.id,
      table_number: table,
      status: "PENDING",
      created_at: new Date(),
    })
    .select()
    .single();

  if (kitchenError) {

    console.error(
      "KITCHEN ERROR",
      kitchenError
    );

    throw kitchenError;
  }

  // ===== SAFE KITCHEN ITEMS =====
  const kitchenItems =
    insertedItems.map((item) => ({

      tenant_id,

      kitchen_ticket_id:
        kitchenTicket.id,

      item_name:
        item.item_name,

      quantity:
        item.quantity,

      station:
        "MAIN",

      status:
        "PENDING",

      created_at:
        new Date().toISOString(),
    }));

  const {
    error: kitchenItemsError,
  } = await supabase
    .from(
      "kitchen_ticket_items"
    )
    .insert(
      kitchenItems
    );

  if (kitchenItemsError) {

    console.error(
      "KITCHEN ITEMS ERROR",
      kitchenItemsError
    );

    throw kitchenItemsError;
  }

  // ===== TABLE SESSION =====
  const {
    data: existingSession,
  } = await supabase
    .from("table_sessions")
    .select("*")
    .eq(
      "table_number",
      table
    )
    .eq(
      "status",
      "ACTIVE"
    )
    .single();

  if (existingSession) {

    await supabase
      .from("table_sessions")
      .update({

        revenue:
          Number(
            existingSession.revenue || 0
          ) + total,

        orders:
          Number(
            existingSession.orders || 0
          ) + 1,
      })
      .eq(
        "id",
        existingSession.id
      );

  } else {

    await supabase
      .from("table_sessions")
      .insert({

        table_number:
          table,

        status:
          "ACTIVE",

        started_at:
          new Date(),

        guests: 2,

        orders: 1,

        revenue:
          total,

        tenant_id,
      });
  }

  // ===== REALTIME =====
  await supabase
    .from("pos_realtime_events")
    .insert({

      tenant_id,

      event_type:
        "ORDER_CREATED",

      entity_type:
        "ORDER",

      entity_id:
        order.id,

      payload: {

        order,

        items:
          insertedItems,

        table_number:
          table,

        kitchen_ticket_id:
          kitchenTicket.id,
      },

      status:
        "PUBLISHED",

      created_at:
        new Date(),
    });

  return order;
}
