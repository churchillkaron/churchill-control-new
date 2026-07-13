import { supabaseAdmin } from "@/lib/shared/supabase/admin";

/**
 * AVANTIQO CONTROL OVERVIEW
 */

export async function GET() {
  const { data: organizations } = await supabaseAdmin
    .from("organizations")
    .select("*");

  const { data: events } = await supabaseAdmin
    .from("organization_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: modules } = await supabaseAdmin
    .from("platform_modules")
    .select("*");

  return Response.json({
    organizations: organizations || [],
    recentEvents: events || [],
    modules: modules || [],
  });
}
