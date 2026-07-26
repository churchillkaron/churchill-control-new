import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_shots";

export async function list({ organization_id, creative_project_id, scene_id } = {}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!creative_project_id) return [];

  let query = supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .eq("creative_project_id", creative_project_id)
    .is("archived_at", null)
    .order("scene_number")
    .order("shot_number");

  if (scene_id) query = query.eq("scene_id", scene_id);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function get(id) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function create(shot) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert(shot)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function update(id, values = {}) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update({
      ...values,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}
