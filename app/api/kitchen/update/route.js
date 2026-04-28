export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import { runProduction } from "@/lib/production";

const TENANT_ID = "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

export async function POST(req) {
  try {
    // ✅ INIT SUPABASE INSIDE FUNCTION
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return Response.json(
        { error: "Missing Supabase environment variables" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { order_id, status } = await req.json();

    if (!order_id || !status) {
      return Response.json({ error: "Missing data" }, { status: 400 });
    }

    // 🔹 UPDATE ORDER STATUS
    const { error } = await supabase
      .from("orders")
      .update({ kitchen_status: status })
      .eq("id", order_id)
      .eq("tenant_id", TENANT_ID);

    if (error) throw error;

    // 🔥 RUN PRODUCTION WHEN DONE
    if (status === "done") {
      const { data: items } = await supabase
        .from("order_items")
        .select("dish_id, quantity")
        .eq("order_id", order_id)
        .eq("tenant_id", TENANT_ID);

      for (const item of items || []) {
        await runProduction({
          tenant_id: TENANT_ID,
          dish_id: item.dish_id,
          quantity: item.quantity,
          source_id: `order-${order_id}-dish-${item.dish_id}`,
        });
      }
    }

    return Response.json({ success: true });

  } catch (err) {
    console.error("KITCHEN ERROR:", err);

    return Response.json(
      { error: err.message },
      { status: 500 }
    );
  }
}