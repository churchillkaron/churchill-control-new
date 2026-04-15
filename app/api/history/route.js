import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    const { data, error } = await supabase
      .from("daily-reports")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return Response.json({ data }); // 🔥 FIX HERE

  } catch (err) {
    return Response.json(
      { error: err.message },
      { status: 500 }
    );
  }
}