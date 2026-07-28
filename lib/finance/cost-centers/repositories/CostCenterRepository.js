import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function requireOrganizationId(organizationId) {
  if (!organizationId) throw new Error("organizationId required");
}

function applyActiveScope(query) {
  return query.or("is_active.eq.true,is_active.is.null");
}

function applyEntityOrSharedScope(query, entityId) {
  if (!entityId) return query;

  return query.or(
    `entity_id.eq.${entityId},entity_id.is.null`
  );
}

export const CostCenterRepository = {
  async list({ organizationId, entityId = null }) {
    requireOrganizationId(organizationId);

    let query = supabaseAdmin
      .from("cost_centers")
      .select("*")
      .eq("organization_id", organizationId)
      .order("code", { ascending: true })
      .order("name", { ascending: true });

    query = applyActiveScope(query);
    query = applyEntityOrSharedScope(query, entityId);

    const { data, error } = await query;

    if (error) throw error;

    return data || [];
  },

  async get({
    organizationId,
    entityId = null,
    costCenterId,
  }) {
    requireOrganizationId(organizationId);
    if (!costCenterId) throw new Error("costCenterId required");

    let query = supabaseAdmin
      .from("cost_centers")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", costCenterId);

    query = applyActiveScope(query);
    query = applyEntityOrSharedScope(query, entityId);

    const { data, error } = await query.maybeSingle();

    if (error) throw error;

    return data || null;
  },
};
