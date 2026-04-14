import { createClient } from "@supabase/supabase-js";

export async function POST(req) {
  try {
    const body = await req.json();

    const { date, dishes, revenue, cost, profit } = body;

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    // ✅ 1. CHECK IF DATE EXISTS
    const { data: existing, error: fetchError } = await supabase
      .from("daily-reports")
      .select("id")
      .eq("date", date)
      .maybeSingle();

    if (fetchError) {
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500 }
      );
    }

    // ✅ 2. IF EXISTS → UPDATE
    if (existing) {
      const { error: updateError } = await supabase
        .from("daily-reports")
        .update({
          dishes,
          revenue,
          cost,
          profit,
        })
        .eq("id", existing.id);

      if (updateError) {
        return new Response(
          JSON.stringify({ error: updateError.message }),
          { status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true, mode: "updated" }),
        { status: 200 }
      );
    }

    // ✅ 3. IF NOT EXISTS → INSERT
    const { error: insertError } = await supabase
      .from("daily-reports")
      .insert([
        {
          date,
          dishes,
          revenue,
          cost,
          profit,
        },
      ]);

    if (insertError) {
      return new Response(
        JSON.stringify({ error: insertError.message }),
        { status: 500 }
      );
    }

    return new Response(
      JSON.stringify({ success: true, mode: "created" }),
      { status: 200 }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Server error" }),
      { status: 500 }
    );
  }
}