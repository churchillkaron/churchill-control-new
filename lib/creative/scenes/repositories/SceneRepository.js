import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_scenes";

function requireOrganization(input = {}) {
  const organizationId =
    input.organization_id || input.organizationId || null;
  if (!organizationId) throw new Error("organization_id required");
  return organizationId;
}

export async function list({
  organization_id,
  creative_project_id,
}) {
  if (!organization_id) throw new Error("organization_id required");

  let query = supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .order("scene_number");

  if (creative_project_id) {
    query = query.eq("creative_project_id", creative_project_id);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

export async function get(id, input = {}) {
  if (!id) throw new Error("scene id required");
  const organizationId = requireOrganization(input);

  let query = supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (input.creative_project_id) {
    query = query.eq(
      "creative_project_id",
      input.creative_project_id,
    );
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function create(scene) {
  requireOrganization(scene);

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert(scene)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function update(id, values, input = {}) {
  if (!id) throw new Error("scene id required");
  const organizationId = requireOrganization({
    ...input,
    ...values,
  });

  let query = supabaseAdmin
    .from(TABLE)
    .update({
      ...values,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("organization_id", organizationId);

  const projectId =
    input.creative_project_id || values.creative_project_id;
  if (projectId) {
    query = query.eq("creative_project_id", projectId);
  }

  const { data, error } = await query
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("SCENE_NOT_FOUND_IN_ORGANIZATION");
  return data;
}
