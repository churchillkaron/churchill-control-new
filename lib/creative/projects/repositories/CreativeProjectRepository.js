import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

const TABLE =
  "creative_project_state";

export async function create(
  project,
) {

  const { data, error } =
    await supabaseAdmin
      .from(TABLE)
      .insert(project)
      .select()
      .single();

  if (error)
    throw error;

  return data;

}

export async function update(
  id,
  values,
) {

  const { data, error } =
    await supabaseAdmin
      .from(TABLE)
      .update({

        ...values,

        updated_at:
          new Date().toISOString(),

      })
      .eq("id", id)
      .select()
      .single();

  if (error)
    throw error;

  return data;

}

export async function archive(
  id,
) {

  return update(id, {

    archived: true,

    status: "ARCHIVED",

  });

}

export async function duplicate(
  id,
) {

  const original =
    await getById(id);

  const copy = {

    ...original,

    id:
      crypto.randomUUID(),

    version:
      (original.version || 1) + 1,

    status:
      "DRAFT",

    archived:
      false,

    created_at:
      new Date().toISOString(),

    updated_at:
      new Date().toISOString(),

  };

  delete copy.created_by;

  return create(copy);

}

export async function getById(
  id,
) {

  const { data, error } =
    await supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("id", id)
      .single();

  if (error)
    throw error;

  return data;

}

export async function listByOrganization(
  organizationId,
) {

  const { data, error } =
    await supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq(
        "organization_id",
        organizationId
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

  if (error)
    throw error;

  return data;

}
