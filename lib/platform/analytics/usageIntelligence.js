import { supabaseClient } from "@/lib/shared/supabase/client";

/**
 * AVANTIQO USAGE INTELLIGENCE ENGINE
 */
export async function getModuleUsage(organizationId) {
  const { data, error } = await supabaseClient
    .from("organization_events")
    .select("*")
    .eq("organization_id", organizationId);

  if (error) {
    console.error("USAGE_FETCH_ERROR", {
      organizationId,
      message: error?.message || "Unable to load organization usage",
    });
    return [];
  }

  const usage = {};

  for (const event of data || []) {
    const moduleName = event.metadata?.module;
    if (!moduleName) continue;
    usage[moduleName] = (usage[moduleName] || 0) + 1;
  }

  return usage;
}
