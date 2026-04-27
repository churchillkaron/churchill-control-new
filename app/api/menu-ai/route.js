import { supabase } from "@/lib/supabase";

export async function GET() {
  const tenant_id = "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

  try {
    const now = new Date();
    const start = new Date(now.setHours(0, 0, 0, 0)).toISOString();
    const end = new Date(now.setHours(23, 59, 59, 999)).toISOString();

    const { data: sales } = await supabase
      .from("daily_sales_items")
      .select("dish_id, quantity, price, created_at")
      .eq("tenant_id", tenant_id)
      .gte("created_at", start)
      .lte("created_at", end);

    const { data: dishes } = await supabase
      .from("dishes")
      .select("id, name")
      .eq("tenant_id", tenant_id);

    const { data: dishStock } = await supabase
      .from("dish_stock")
      .select("dish_id, quantity")
      .eq("tenant_id", tenant_id);

    const dishMap = {};
    for (const d of dishes || []) {
      dishMap[d.id] = d.name;
    }

    const stockMap = {};
    for (const s of dishStock || []) {
      stockMap[s.dish_id] = Number(s.quantity || 0);
    }

    const resultMap = {};

    for (const item of sales || []) {
      const dishId = item.dish_id;

      if (!resultMap[dishId]) {
        resultMap[dishId] = {
          dish_id: dishId,
          name: dishMap[dishId] || dishId,
          sold: 0,
          revenue: 0,
          stock: stockMap[dishId] || 0,
        };
      }

      const qty = Number(item.quantity || 0);
      const price = Number(item.price || 0);

      resultMap[dishId].sold += qty;
      resultMap[dishId].revenue += qty * price;
    }

    const analysis = Object.values(resultMap).map((dish) => {
      let status = "NORMAL";
      let action = "Keep selling";

      if (dish.sold >= 15 && dish.stock <= 5) {
        status = "POPULAR_LOW_STOCK";
        action = "Produce more now";
      } else if (dish.sold >= 15) {
        status = "BEST_SELLER";
        action = "Push this dish";
      } else if (dish.sold <= 2) {
        status = "LOW_DEMAND";
        action = "Do not overproduce";
      }

      return {
        ...dish,
        avg_price: dish.sold > 0 ? dish.revenue / dish.sold : 0,
        status,
        action,
      };
    });

    return Response.json({
      success: true,
      analysis,
    });
  } catch (err) {
    console.error("MENU AI ERROR:", err);

    return Response.json(
      { error: err.message },
      { status: 500 }
    );
  }
}