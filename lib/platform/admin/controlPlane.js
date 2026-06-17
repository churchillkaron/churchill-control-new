import { getSystemHealth } from "@/lib/platform/analytics/systemHealth";
import { supabaseClient } from "@/lib/shared/supabase/client";

/**
 * AVANTIQO CONTROL PLANE SERVICE
 */

export async function getControlPlaneSnapshot() {
  const health = await getSystemHealth();

  const { data: orgs } = await supabaseClient
    .from("organizations")
    .select("*");

  const { data: events } = await supabaseClient
    .from("tenant_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  return {
    health,
    organizations: orgs || [],
    recentActivity: events || [],
  };
}
