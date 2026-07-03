import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

const TABLE =
  "creative_assets";

export async function create(asset) {

  const { data, error } =
    await supabaseAdmin
      .from(TABLE)
      .insert(asset)
      .select()
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
      .eq("project_id", projectId)
      .order("created_at");

  if (error)
    throw error;

  return data;

}
