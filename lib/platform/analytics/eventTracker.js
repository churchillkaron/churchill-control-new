import { supabaseClient } from "@/lib/shared/supabase/client";

/**
 * AVANTIQO EVENT TRACKING ENGINE
 */

export async function trackEvent({
  organizationId,
  organization_id,
  event,
  metadata = {},
}) {
  const resolvedOrganizationId =
    organizationId || organization_id;

  if (!resolvedOrganizationId || !event) return;

  const { error } =
    await supabaseClient
      .from("organization_events")
      .insert({
        organization_id: resolvedOrganizationId,
        event,
        metadata,
        created_at: new Date().toISOString(),
      });

  if (error) {
    console.error("event tracking error:", error);
  }
}
