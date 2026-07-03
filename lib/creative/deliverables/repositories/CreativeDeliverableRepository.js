import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

const TABLE =
  "creative_deliverables";

export async function create(
  deliverable,
) {

  const { data, error } =
    await supabaseAdmin
      .from(TABLE)
      .insert(deliverable)
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

export async function listByProject(
  projectId,
) {

  const { data, error } =
    await supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq(
        "project_id",
        projectId
      )
      .order(
        "created_at",
        {
          ascending: true,
        }
      );

  if (error)
    throw error;

  return data;

}
