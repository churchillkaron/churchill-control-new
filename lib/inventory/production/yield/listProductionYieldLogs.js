import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function listProductionYieldLogs({
  organization_id,
  organizationId,
  entity_id = null,
  entityId = null,
  limit = 500,
}) {
  const resolvedOrganizationId = organization_id || organizationId;
  const resolvedEntityId = entity_id || entityId || null;

  if (!resolvedOrganizationId) {
    throw new Error("organization_id required");
  }

  let query = supabaseAdmin
    .from("production_yield_logs")
    .select("*")
    .eq("organization_id", resolvedOrganizationId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(Number(limit) || 500, 1), 1000));

  if (resolvedEntityId) {
    query = query.eq("entity_id", resolvedEntityId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}
