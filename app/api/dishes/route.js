export const dynamic = "force-dynamic";

import { getSupabase } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("dishes")
      .select("*")
      .order("name");

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json(data || []);

  } catch (err) {
    return Response.json(
      { error: err.message },
      { status: 500 }
    );
  }
}