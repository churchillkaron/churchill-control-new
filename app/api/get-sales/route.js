import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data, error } = await supabase
      .from("sales")
      .select(`
        id,
        quantity,
        created_at,
        dishes (
          name
        )
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return Response.json(data);

  } catch (err) {
    console.error(err);
    return Response.json(
      { error: err.message || "Server error" },
      { status: 500 }
    );
  }
}