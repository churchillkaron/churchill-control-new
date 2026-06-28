import { createServerSupabase } from "@/lib/shared/supabase/server";
import { getCache, setCache } from "@/lib/shared/cache/memoryCache";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const organization_id = searchParams.get("organization_id");

    if (!organization_id) {
      return Response.json({ error: "missing organization_id" }, { status: 400 });
    }

    const cacheKey = `pos_state:${organization_id}`;

    const cached = getCache(cacheKey);
    if (cached) {
      return Response.json({ source: "cache", data: cached });
    }

    const supabase = createServerSupabase();

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("organization_id", organization_id)
      .in("status", ["OPEN", "SENT", "PREPARING"]);

    if (error) throw error;

    setCache(cacheKey, data, 15000);

    return Response.json({
      source: "db",
      data
    });

  } catch (err) {
    return Response.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
