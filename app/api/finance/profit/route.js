import { supabase } from "@/lib/supabase";

export async function GET() {
  const tenant_id = "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

  const { data, error } = await supabase
    .from("order_profit_view")
    .select("*")
    .eq("tenant_id", tenant_id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ data });
}