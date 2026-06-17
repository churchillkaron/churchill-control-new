import { supabaseClient } from "@/lib/shared/supabase/client";

/**
 * AVANTIQO EVENT TRACKING ENGINE
 * Core SaaS observability layer
 */

export async function trackEvent({
  tenantId,
  organizationId,
  event,
  metadata = {},
}) {
  if (!tenantId || !event) return;

  const { error } = await supabaseClient
    .from("tenant_events")
    .insert({
      tenant_id: tenantId,
      organization_id: organizationId,
      event,
      metadata,
      created_at: new Date().toISOString(),
    });

  if (error) {
    console.error("event tracking error:", error);
  }
}
