import { createClient } from "@supabase/supabase-js";

export async function POST(req) {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    const body = await req.json();

    const { error } = await supabase.from("daily-reports").insert([
      {
        date: body.date,
        dishes: body.dishes,
        revenue: body.revenue,
        cost: body.cost,
        profit: body.profit,
      },
    ]);

    if (error) throw error;

    return Response.json({ success: true });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}