import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function requireOrganizationId(organizationId) {
  if (!organizationId) throw new Error("organizationId required");
}

export const CostCenterRepository = {
  async list({ organizationId, entityId = null }) {
    requireOrganizationId(organizationId);

    let query = supabaseAdmin
      .from("cost_centers")
      .select("*")
      .eq("organization_id", organizationId)
      .order("name", { ascending: true });

    if (entityId) {
      query = query.eq("entity_id", entityId);
    }

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

    if (entityId) {
      query = query.eq("entity_id", entityId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) throw error;

    return data || null;
  },
};
