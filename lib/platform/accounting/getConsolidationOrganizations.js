import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function getConsolidationOrganizations({
  organizationId,
} = {}) {
  if (!organizationId) {
    return {
      success: false,
      error: "organizationId required",
      organizationId: null,
      organizations: [],
      entities: [],
      entityIds: [],
    };
  }

  const { data: organization, error: organizationError } =
    await supabaseAdmin
      .from("organizations")
      .select(`
        id,
        name,
        legal_name,
        default_currency
      `)
      .eq("id", organizationId)
      .maybeSingle();

  if (organizationError) {
    return {
      success: false,
      error: organizationError.message,
      organizationId,
      organizations: [],
      entities: [],
      entityIds: [],
    };
  }

  if (!organization) {
    return {
      success: false,
      error: "Organization not found",
      organizationId,
      organizations: [],
      entities: [],
      entityIds: [],
    };
  }

  const { data: entities, error: entityError } =
    await supabaseAdmin
      .from("legal_entities")
      .select(`
        id,
        organization_id,
        legal_name,
        display_name,
        country,
        currency
      `)
      .eq("organization_id", organizationId)
      .order("legal_name", { ascending: true });

  if (entityError) {
    return {
      success: false,
      error: entityError.message,
      organizationId,
      organizations: [organizationId],
      entities: [],
      entityIds: [],
    };
  }

  const resolvedEntities = entities || [];

  return {
    success: true,
    organizationId,
    organization,
    organizations: [organizationId],
    entities: resolvedEntities,
    entityIds: resolvedEntities.map(entity => entity.id),
    mode:
      resolvedEntities.length > 1
        ? "multi_entity"
        : "single_entity",
  };
}
