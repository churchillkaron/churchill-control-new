import { supabase } from "@/lib/supabase";

export async function POST(req) {
  try {
    const body = await req.json();

    const { table, items, total, staff_name, tenant_id } = body;

    // 🔴 VALIDATE BASIC INPUT
    if (!tenant_id) {
      return Response.json({ error: "Missing tenant_id" }, { status: 400 });
    }

    if (!table) {
      return Response.json({ error: "Missing table" }, { status: 400 });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return Response.json({ error: "No items" }, { status: 400 });
    }

    for (const item of items) {
      if (!item.dish_id) {
        return Response.json(
          { error: "Missing dish_id" },
          { status: 400 }
        );
      }

      if (Number(item.quantity || 0) <= 0) {
        return Response.json(
          { error: "Invalid quantity" },
          { status: 400 }
        );
      }
    }

    // 🔒 SERVER-SIDE STOCK VALIDATION (CRITICAL)
    const dishIds = items.map((i) => i.dish_id);

    const { data: stockData, error: stockError } = await supabase
      .from("dish_stock")
      .select("dish_id, quantity")
      .eq("tenant_id", tenant_id)
      .in("dish_id", dishIds);

    if (stockError) {
      console.error("STOCK FETCH ERROR:", stockError);
      return Response.json(
        { error: "Stock validation failed" },
        { status: 500 }
      );
    }

    const stockMap = {};
    for (const s of stockData || []) {
      stockMap[s.dish_id] = Number(s.quantity || 0);
    }

    // 🔴 CHECK STOCK AGAINST REQUEST
    for (const item of items) {
      const available = stockMap[item.dish_id] || 0;
      const needed = Number(item.quantity || 1);

      if (available < needed) {
        return Response.json(
          {
            error: `Not enough stock for ${item.item_name || item.dish_id} (available: ${available})`,
          },
          { status: 400 }
        );
      }
    }

    // ✅ CREATE ORDER
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert([
        {
          tenant_id: tenant_id,
          table_number: table,
          total: Number(total || 0),
          status: "approved",
          kitchen_status: "pending",
          staff_name: staff_name || "Staff",
        },
      ])
      .select()
      .single();

    if (orderError || !order) {
      console.error("ORDER ERROR:", orderError);
      return Response.json(
        { error: "Order creation failed" },
        { status: 500 }
      );
    }

    // ✅ CREATE ORDER ITEMS (1 row per unit)
    const orderItems = [];

    for (const item of items) {
      const qty = Number(item.quantity || 1);

      for (let i = 0; i < qty; i++) {
        orderItems.push({
          tenant_id: tenant_id,
          order_id: order.id,
          item_name: item.item_name || item.name || "Item",
          status: "PENDING",
          dish_id: item.dish_id,
          price: Number(item.price || 0),
          quantity: 1, // 🔥 ALWAYS 1
        });
      }
    }

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItems);

    if (itemsError) {
      console.error("ITEM INSERT ERROR:", itemsError);

      return Response.json(
        { error: "Order items failed" },
        { status: 500 }
      );
    }

    // ✅ SUCCESS
    return Response.json({
      success: true,
      order_id: order.id,
    });

  } catch (err) {
    console.error("POS API ERROR:", err);
    return Response.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}