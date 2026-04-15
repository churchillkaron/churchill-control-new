import { createClient } from "@supabase/supabase-js";

export async function POST(req) {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    const body = await req.json();

    console.log("Incoming data:", body);

    const { data, error } = await supabase
      .from("daily-reports")
      .insert([
        {
          date: body.date,
          dishes: body.dishes,
          revenue: body.revenue,
          cost: body.cost,
          profit: body.profit,
        },
      ])
      .select();

    if (error) {
      console.error("Supabase error:", error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    console.log("Inserted:", data);

    return Response.json({ success: true, data });

  } catch (err) {
    console.error("Server error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}