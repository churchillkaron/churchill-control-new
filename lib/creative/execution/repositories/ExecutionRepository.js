import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  preparePromptlessPersistence,
} from "@/lib/creative/execution/runtime/CreativePromptlessPersistenceRuntime";

const TABLE = "creative_execution_plans";

function toRow(plan) {
  const promptlessPlan = preparePromptlessPersistence(
    plan,
    "CREATIVE_EXECUTION_PLAN",
  );
  return {
    id: promptlessPlan.id,
    organization_id: promptlessPlan.organization_id,
    creative_project_id: promptlessPlan.creative_project_id ?? null,
    production_graph_id: promptlessPlan.production_graph_id ?? null,
    status: promptlessPlan.status,
    metadata: promptlessPlan.metadata ?? {},
    plan: promptlessPlan,
    created_at: promptlessPlan.created_at,
    updated_at: promptlessPlan.updated_at,
  };
}

function fromRow(row) {
  return row?.plan ?? row;
}

export async function create(plan) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert(toRow(plan))
    .select()
    .single();

  if (error) throw error;
  return fromRow(data);
}

export async function update(id, values) {
  const row = {
    ...toRow(values),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update(row)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return fromRow(data);
}

export async function getById(id) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return fromRow(data);
}

export async function listByProject({
  organization_id,
  creative_project_id,
}) {
  let query = supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .order("created_at", { ascending: false });

  if (creative_project_id) {
    query = query.eq("creative_project_id", creative_project_id);
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data || []).map(fromRow);
}
