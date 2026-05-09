export const dynamic = "force-dynamic";
import { supabase }
from "@/lib/supabase";

export async function GET() {
  try {
   

    const { data, error } = await supabase
      .from("ingredients")
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