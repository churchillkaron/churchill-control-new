export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // 🔹 GET PRODUCTION
    const { data: production } = await supabase
      .from("production_logs")
      .select("dish_id, quantity");

    // 🔹 GET WASTE (ONLY DISH)
    const { data: waste } = await supabase
      .from("waste_logs")
      .select("item_id, quantity")
      .eq("type", "dish");

    const result = {};

    // 🔹 SUM PRODUCTION
    for (const p of production || []) {
      if (!result[p.dish_id]) {
        result[p.dish_id] = {
          produced: 0,
          wasted: 0,
        };
      }

      result[p.dish_id].produced += Number(p.quantity);
    }

    // 🔹 SUM WASTE
    for (const w of waste || []) {
      const id = w.item_id;

      if (!result[id]) {
        result[id] = {
          produced: 0,
          wasted: 0,
        };
      }

      result[id].wasted += Number(w.quantity);
    }

    // 🔹 CALCULATE %
    const final = Object.entries(result).map(([dish_id, data]) => {
      const wastePercent =
        data.produced > 0
          ? (data.wasted / data.produced) * 100
          : 0;

      return {
        dish_id,
        produced: data.produced,
        wasted: data.wasted,
        waste_percent: wastePercent,
      };
    });

    return Response.json(final);

  } catch (err) {

    return Response.json(
      {
        error: err.message,
      },
      {
        status: 500,
      }
    );

  }
}