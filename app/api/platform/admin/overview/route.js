import { requirePlatformAdminAccess } from "@/lib/platform/security/requirePlatformAdminAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function GET() {
  const access = await requirePlatformAdminAccess();

  if (!access.success) {
    return Response.json(
      { success: false, error: access.error },
      { status: access.status },
    );
  }

  const { data: organizations, error: organizationsError } = await supabaseAdmin
    .from("organizations")
    .select("*");

  if (organizationsError) throw organizationsError;

  const { data: events, error: eventsError } = await supabaseAdmin
    .from("organization_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (eventsError) throw eventsError;

  const { data: modules, error: modulesError } = await supabaseAdmin
    .from("platform_modules")
    .select("*");

  if (modulesError) throw modulesError;

  return Response.json({
    success: true,
    organizations: organizations || [],
    recentEvents: events || [],
    modules: modules || [],
  });
}
