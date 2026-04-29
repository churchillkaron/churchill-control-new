export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";

export async function POST(req) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return Response.json(
        { error: "Missing Supabase environment variables" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { order_id, status, tenant_id } = await req.json();

    if (!tenant_id) {
      return Response.json({ error: "Missing tenant_id" }, { status: 400 });
    }

    if (!order_id || !status) {
      return Response.json({ error: "Missing data" }, { status: 400 });
    }

    // UPDATE ORDER STATUS
    const { error: updateError } = await supabase
      .from("orders")
      .update({ kitchen_status: status })
      .eq("id", order_id)
      .eq("tenant_id", tenant_id);

    if (updateError) throw updateError;

    // 🔥 ONLY DEDUCT DISH STOCK (NO PRODUCTION)
    if (status === "done") {
      const { data: items, error: itemsError } = await supabase
        .from("order_items")
        .select("dish_id, quantity")
        .eq("order_id", order_id)
        .eq("tenant_id", tenant_id);

      if (itemsError) throw itemsError;

      for (const item of items || []) {
        const { error: stockError } = await supabase.rpc(
          "decrement_dish_stock",
          {
            p_tenant_id: tenant_id,
            p_dish_id: item.dish_id,
            p_qty: Number(item.quantity),
          }
        );

        if (stockError) {
          return Response.json(
            {
              error: "Stock deduction failed",
              detail: stockError.message,
            },
            { status: 500 }
          );
        }
      }
    }

    return Response.json({ success: true });

  } catch (err) {
    console.error("KITCHEN ERROR:", err);

    return Response.json(
      { error: err.message || "Kitchen error" },
      { status: 500 }
    );
  }
}