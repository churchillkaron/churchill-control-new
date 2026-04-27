import { supabase } from "@/lib/supabase";

export async function POST(req) {
  const body = await req.json();

  const tenant_id = "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

  try {
    // 🔴 VALIDATE INPUT
    for (const i of body.items) {
      if (!i.dish_id) {
        return Response.json(
          { error: "Missing dish_id — POS must send dish_id" },
          { status: 400 }
        );
      }
    }

    // 🔴 CHECK STOCK FIRST (NO ORDER YET)
    for (const i of body.items) {
      const { data: stock, error: stockError } = await supabase
        .from("dish_stock")
        .select("quantity")
        .eq("tenant_id", tenant_id)
        .eq("dish_id", i.dish_id)
        .single();

      if (stockError) {
        console.error("STOCK FETCH ERROR:", stockError);
        return Response.json(
          { error: "Stock check failed" },
          { status: 500 }
        );
      }

      const available = Number(stock?.quantity || 0);
      const needed = Number(i.quantity || 1);

      if (available < needed) {
        // 🔥 GET DISH NAME
        const { data: dish } = await supabase
          .from("dishes")
          .select("name")
          .eq("id", i.dish_id)
          .eq("tenant_id", tenant_id)
          .single();

        const dishName = dish?.name || i.dish_id;

        return Response.json(
          { error: `Not enough stock for ${dishName}` },
          { status: 400 }
        );
      }
    }

    // 🔹 CREATE ORDER
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
  tenant_id,
  table_number: body.table,
  total: body.total,
  status: "approved",
  kitchen_status: "pending",
  staff_name: body.staff_name || "Staff 1", // 🔥 ADD THIS
})
      .select()
      .single();

    if (orderError || !order) {
      console.error("ORDER ERROR:", orderError);
      return Response.json({ error: "Order failed" }, { status: 500 });
    }

    // 🔹 CREATE ITEMS
    const items = body.items.map((i) => ({
      tenant_id,
      order_id: order.id,
      item_name: i.item_name || i.name,
      status: "PENDING",
      dish_id: i.dish_id,
      price: i.price,
      quantity: i.quantity || 1,
    }));

    const { error: insertError } = await supabase
      .from("order_items")
      .insert(items);

    if (insertError) {
      console.error("ITEM INSERT ERROR:", insertError);
      return Response.json({ error: "Item insert failed" }, { status: 500 });
    }

    // 🔴 DEDUCT STOCK (FINAL STEP)
    for (const item of items) {
      const { error: stockError } = await supabase.rpc(
        "decrement_dish_stock",
        {
          p_tenant_id: tenant_id,
          p_dish_id: item.dish_id,
          p_qty: item.quantity,
        }
      );

      if (stockError) {
        console.error("STOCK DEDUCTION ERROR:", stockError);

        // 🔥 CRITICAL: FAIL HARD (no silent corruption)
        return Response.json(
          { error: "Stock deduction failed — system inconsistent" },
          { status: 500 }
        );
      }
    }

    return Response.json({
      success: true,
      order_id: order.id,
    });
  } catch (err) {
    console.error("POS API ERROR:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}