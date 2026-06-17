import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const organizationId = searchParams.get("organizationId");

  if (!organizationId) {
    return new Response(JSON.stringify({ success: false, error: "Missing organizationId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("hotel_metrics")
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error) {
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, metrics: data || {} }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
