export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    const tenant_id = "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

    // ✅ INIT INSIDE FUNCTION (CRITICAL)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return Response.json(
        { error: "Missing Supabase environment variables" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

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

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}