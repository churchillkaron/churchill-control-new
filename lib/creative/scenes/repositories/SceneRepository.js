import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_scenes";

export async function list({
  organization_id,
  creative_project_id,
}) {

  const { data, error } =
    await supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("organization_id", organization_id)
      .eq("creative_project_id", creative_project_id)
      .order("scene_number");

  if (error) throw error;

  return data || [];

}

export async function create(scene) {

  const { data, error } =
    await supabaseAdmin
      .from(TABLE)
      .insert(scene)
      .select()
      .single();

  if (error) throw error;

  return data;

}

export async function update(id, values) {

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

  if (error) throw error;

  return data;

}
