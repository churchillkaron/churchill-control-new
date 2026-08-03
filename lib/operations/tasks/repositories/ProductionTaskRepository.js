import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_production_tasks";

export async function create(task) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert(task)
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
    .single();

  if (error) throw error;
  return data;
}

export async function listByProject({
  organization_id,
  creative_project_id = null,
  production_graph_id = null,
  scene_id = null,
  shot_id = null,
  status = null,
} = {}) {
  if (!organization_id) throw new Error("organization_id required");

  let query = supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  if (creative_project_id) {
    query = query.eq("creative_project_id", creative_project_id);
  }
  if (production_graph_id) {
    query = query.eq("production_graph_id", production_graph_id);
  }
  if (scene_id) {
    query = query.eq("scene_id", scene_id);
  }
  if (shot_id) {
    query = query.eq("shot_id", shot_id);
  }
  if (status) {
    query = Array.isArray(status)
      ? query.in("status", status)
      : query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}
