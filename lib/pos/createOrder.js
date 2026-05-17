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

      dish_id:
        item.dish_id,

      item_name:
        item.item_name,

      quantity:
        item.quantity,

      price:
        item.price,

      tenant_id,
    }));

  const {
    error: itemError,
  } = await supabase
    .from("order_items")
    .insert(orderItems);

  if (itemError) {
    console.error(
      "ITEM ERROR",
      itemError
    );

    throw itemError;
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

  return order;
}
