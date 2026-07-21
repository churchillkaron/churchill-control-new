import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_production_tasks";

export async function create(task) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .upsert(task, {
      onConflict: "id",
      ignoreDuplicates: false,
    })
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

export async function getById(id) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function listByProject({
  organization_id,
  creative_project_id,
}) {
  let query = supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  if (creative_project_id) {
    query = query.eq(
      "creative_project_id",
      creative_project_id,
    );
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}
