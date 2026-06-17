import { supabaseClient } from "@/lib/shared/supabase/client";

/**
 * AVANTIQO SYSTEM HEALTH ENGINE
 */

export async function getSystemHealth() {
  const { data: events } = await supabaseClient
    .from("tenant_events")
    .select("*");

  const totalEvents = events?.length || 0;

  const moduleLoadEvents =
    events?.filter(e => e.event === "NAV_MODULE_LOADED")?.length || 0;

  return {
    totalEvents,
    moduleLoadEvents,
    systemStatus:
      totalEvents > 0 ? "ACTIVE" : "IDLE",
  };
}
