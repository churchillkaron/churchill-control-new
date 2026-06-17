import { supabaseClient } from "@/lib/shared/supabase/client";

/**
 * AVANTIQO PLAN LIFECYCLE ENGINE
 * Handles upgrade / downgrade / activation
 */

export async function updateOrganizationPlan({
  organizationId,
  plan,
}) {
  if (!organizationId || !plan) return null;

  const { data, error } = await supabaseClient
    .from("organizations")
    .update({
      plan,
      updated_at: new Date().toISOString(),
    })
    .eq("id", organizationId)
    .select()
    .single();

  if (error) {
    console.error("plan update error:", error);
    return null;
  }

  return data;
}
