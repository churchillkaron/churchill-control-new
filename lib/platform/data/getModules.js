import { supabaseClient } from "@/lib/shared/supabase/client";

/**
 * CLIENT-SAFE MODULE ACCESS LAYER
 * (USED BY NAV + WORKSPACE UI ONLY)
 */

export async function getModules({
  organizationId,
  industry,
}) {
  const { data, error } = await supabaseClient
    .from("platform_modules")
    .select("*");

  if (error) {
    console.error("getModules error:", error);
    return [];
  }

  return data || [];
}
