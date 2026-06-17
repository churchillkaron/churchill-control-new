/**
 * USAGE LOGGER
 * Tracks every AI operation per tenant
 */

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function logUsage({
  tenantId,
  organizationId,
  feature,
  cost,
  metadata = {},
}) {
  if (!tenantId) return;

  await supabaseAdmin.from("ai_usage_logs").insert({
    tenant_id: tenantId,
    organization_id: organizationId,
    feature,
    cost,
    metadata,
    created_at: new Date().toISOString(),
  });
}
