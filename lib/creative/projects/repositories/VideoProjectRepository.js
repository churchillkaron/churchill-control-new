import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

const TABLE =
  "video_projects";

export async function create(
  project
) {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(TABLE)
    .insert(project)
    .select()
    .single();

  if (error)
    throw error;

  return data;

}

export async function get(
  id
) {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .single();

  if (error)
    throw error;

  return data;

}

export async function list(
  organization_id
) {

  let query =
    supabaseAdmin
      .from(TABLE)
      .select("*")
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

  if (organization_id) {
    query =
      query.eq(
        "organization_id",
        organization_id
      );
  }

  const {
    data,
    error,
  } = await query;

  if (error)
    throw error;

  return data;

}

export async function update(
  id,
  values
) {

  values.updated_at =
    new Date().toISOString();

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(TABLE)
    .update(values)
    .eq("id", id)
    .select()
    .single();

  if (error)
    throw error;

  return data;

}
