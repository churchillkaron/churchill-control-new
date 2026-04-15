import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("daily-reports")
      .select("*")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ data: data || [] }, { status: 200 });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to fetch history." },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const { id, date, dishes, revenue, cost, profit } = body || {};

    if (!id) {
      return Response.json({ error: "Missing report id." }, { status: 400 });
    }

    if (!date) {
      return Response.json({ error: "Missing date." }, { status: 400 });
    }

    if (!Array.isArray(dishes) || dishes.length === 0) {
      return Response.json(
        { error: "At least one dish is required." },
        { status: 400 }
      );
    }

    const cleanedDishes = dishes
      .map((dish) => {
        const qty = Number(dish.qty) || 0;
        const price = Number(dish.price) || 0;
        const unitCost = Number(dish.cost) || 0;
        const rowRevenue =
          typeof dish.revenue !== "undefined"
            ? Number(dish.revenue) || 0
            : qty * price;
        const rowProfit =
          typeof dish.profit !== "undefined"
            ? Number(dish.profit) || 0
            : rowRevenue - qty * unitCost;

        return {
          name: String(dish.name || "").trim(),
          qty,
          price,
          cost: unitCost,
          revenue: rowRevenue,
          profit: rowProfit,
        };
      })
      .filter((dish) => dish.name !== "");

    if (cleanedDishes.length === 0) {
      return Response.json(
        { error: "At least one valid dish is required." },
        { status: 400 }
      );
    }

    const finalRevenue =
      typeof revenue !== "undefined"
        ? Number(revenue) || 0
        : cleanedDishes.reduce((sum, dish) => sum + (Number(dish.revenue) || 0), 0);

    const finalCost =
      typeof cost !== "undefined"
        ? Number(cost) || 0
        : cleanedDishes.reduce(
            (sum, dish) => sum + (Number(dish.qty) || 0) * (Number(dish.cost) || 0),
            0
          );

    const finalProfit =
      typeof profit !== "undefined"
        ? Number(profit) || 0
        : cleanedDishes.reduce((sum, dish) => sum + (Number(dish.profit) || 0), 0);

    const { data, error } = await supabase
      .from("daily-reports")
      .update({
        date,
        dishes: cleanedDishes,
        revenue: finalRevenue,
        cost: finalCost,
        profit: finalProfit,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ data }, { status: 200 });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to update report." },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const body = await request.json();
    const { id } = body || {};

    if (!id) {
      return Response.json({ error: "Missing report id." }, { status: 400 });
    }

    const { error } = await supabase
      .from("daily-reports")
      .delete()
      .eq("id", id);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true }, { status: 200 });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to delete report." },
      { status: 500 }
    );
  }
}