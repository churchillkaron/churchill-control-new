import { supabase } from "@/lib/supabase";

export async function GET() {
  const tenant_id = "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

  try {
    const now = new Date();
    const hour = now.getHours();

    const start = new Date(now.setHours(0, 0, 0, 0)).toISOString();
    const end = new Date(now.setHours(23, 59, 59, 999)).toISOString();

    // 🔹 STOCK
    const { data: dishStock } = await supabase
      .from("dish_stock")
      .select("dish_id, quantity")
      .eq("tenant_id", tenant_id);

    // 🔹 DISH NAMES
    const { data: dishes } = await supabase
      .from("dishes")
      .select("id, name")
      .eq("tenant_id", tenant_id);

    // 🔹 SALES
    const { data: sales } = await supabase
      .from("daily_sales_items")
      .select("dish_id, quantity")
      .eq("tenant_id", tenant_id)
      .gte("created_at", start)
      .lte("created_at", end);

    const dishMap = {};
    for (const d of dishes || []) {
      dishMap[d.id] = d.name;
    }

    // 🔹 SALES MAP
    const salesMap = {};
    for (const s of sales || []) {
      if (!salesMap[s.dish_id]) salesMap[s.dish_id] = 0;
      salesMap[s.dish_id] += Number(s.quantity || 0);
    }

    const suggestions = (dishStock || [])
      .map((d) => {
        const stock = Number(d.quantity || 0);
        const sold = salesMap[d.dish_id] || 0;

        const isCritical = stock <= 2;
        const isLow = stock <= 5;

        let suggested = 0;

        // 🔥 SALES LOGIC
        if (sold === 0) {
          suggested = 0;
        } else if (sold < 5) {
          suggested = Math.max(5 - stock, 2);
        } else if (sold < 15) {
          suggested = Math.max(10 - stock, 5);
        } else {
          suggested = Math.max(20 - stock, 10);
        }

        // 🔥 TIME MULTIPLIER
        let timeMultiplier = 1;

        if (hour >= 11 && hour < 14) {
          timeMultiplier = 1.5; // lunch
        } else if (hour >= 17 && hour < 21) {
          timeMultiplier = 2; // dinner
        } else if (hour >= 21 || hour < 6) {
          timeMultiplier = 0; // stop
        } else {
          timeMultiplier = 0.5; // slow hours
        }

        suggested = Math.floor(suggested * timeMultiplier);

        return {
          dish_id: d.dish_id,
          name: dishMap[d.dish_id] || d.dish_id,
          current_stock: stock,
          sold_today: sold,
          suggested_quantity: suggested,
          reason: isCritical
            ? "CRITICAL"
            : isLow
            ? "LOW"
            : "OK",
          auto: isCritical && suggested > 0,
        };
      })
      .filter((d) => d.suggested_quantity > 0);

    // 🔒 LOCK + AUTO
    for (const item of suggestions) {
      if (!item.auto) continue;

      const { data: existingLock } = await supabase
        .from("production_locks")
        .select("created_at")
        .eq("tenant_id", tenant_id)
        .eq("dish_id", item.dish_id)
        .gte(
          "created_at",
          new Date(Date.now() - 10 * 60 * 1000).toISOString()
        )
        .maybeSingle();

      if (existingLock) continue;

      await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/production`, {
        method: "POST",
        body: JSON.stringify({
          dish_id: item.dish_id,
          quantity: item.suggested_quantity,
        }),
      });

      await supabase.from("production_locks").insert({
        tenant_id,
        dish_id: item.dish_id,
      });
    }

    return Response.json({
      success: true,
      suggestions,
      hour,
    });

  } catch (err) {
    console.error("AI TIME PRODUCTION ERROR:", err);

    return Response.json(
      { error: err.message },
      { status: 500 }
    );
  }
}