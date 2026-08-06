import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  preparePromptlessPersistence,
} from "@/lib/creative/execution/runtime/CreativePromptlessPersistenceRuntime";

const TABLE = "creative_production_tasks";

function promptlessTask(value, label) {
  return preparePromptlessPersistence(value, label);
}

export async function create(task) {
  const payload = promptlessTask(task, "CREATIVE_PRODUCTION_TASK");
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function update(id, values) {
  const payload = promptlessTask(
    {
      ...values,
      updated_at: new Date().toISOString(),
    },
    "CREATIVE_PRODUCTION_TASK_UPDATE",
  );
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update(payload)
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
  creative_project_id,
  production_graph_id,
} = {}) {
  if (!organization_id) {
    throw new Error("PRODUCTION_TASK_ORGANIZATION_SCOPE_REQUIRED");
  }

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

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}
