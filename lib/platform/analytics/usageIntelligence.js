import { supabaseClient } from "@/lib/shared/supabase/client";

/**
 * AVANTIQO USAGE INTELLIGENCE ENGINE
 */

export async function getModuleUsage(organizationId) {
  const { data, error } = await supabaseClient
    .from("tenant_events")
    .select("*")
    .eq("organization_id", organizationId);

  if (error) {
    console.error("usage fetch error:", error);
    return [];
  }

  const usage = {};

  for (const event of data || []) {
    const module = event.metadata?.module;

    if (!module) continue;

    usage[module] = (usage[module] || 0) + 1;
  }

  return usage;
}
