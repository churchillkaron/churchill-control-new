import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_characters";

export async function create(character) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert(character)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function update(id, values) {
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

export async function list({
  organization_id,
  creative_project_id,
} = {}) {
  let query = supabaseAdmin
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false });

  if (organization_id) {
    query = query.eq("organization_id", organization_id);
  }

  if (creative_project_id) {
    query = query.eq("creative_project_id", creative_project_id);
  }

  const { data, error } = await query;

  if (error) throw error;

  return data || [];
}
