import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function requireOrganizationId(organizationId) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }
}

export const ProjectRepository = {

  async list({
    organizationId,
    entityId = null,
  }) {

    requireOrganizationId(organizationId);

    let query =
      supabaseAdmin
        .from("projects")
        .select("*")
        .eq(
          "organization_id",
          organizationId
        )
        .order(
          "name",
          { ascending: true }
        );

    if (entityId) {
      query =
        query.eq(
          "entity_id",
          entityId
        );
    }

    const {
      data,
      error,
    } = await query;

    if (error) throw error;

    return data || [];

  },

};
