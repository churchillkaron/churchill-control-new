import { supabaseAdmin } from "@/lib/shared/supabase/admin";

/**
 * AVANTIQO CONTROL OVERVIEW
 */

export async function GET() {
  const { data: tenants } = await supabaseAdmin
    .from("organizations")
    .select("*");

  const { data: events } = await supabaseAdmin
    .from("tenant_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: modules } = await supabaseAdmin
    .from("platform_modules")
    .select("*");

  return Response.json({
    tenants: tenants || [],
    recentEvents: events || [],
    modules: modules || [],
  });
}
