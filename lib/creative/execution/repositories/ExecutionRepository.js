import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_execution_plans";

function toRow(plan) {
  return {
    id: plan.id,
    organization_id: plan.organization_id,
    creative_project_id: plan.creative_project_id ?? null,
    production_graph_id: plan.production_graph_id ?? null,
    status: plan.status,
    metadata: plan.metadata ?? {},
    plan,
    created_at: plan.created_at,
    updated_at: plan.updated_at,
  };
}

export async function create(plan) {

  const { data, error } =
    await supabaseAdmin
      .from(TABLE)
      .insert(toRow(plan))
      .select()
      .single();

  if (error) throw error;

  return data;
}

export async function update(id, values) {

  const row = {
    ...toRow(values),
    updated_at: new Date().toISOString(),
  };

  const { data, error } =
    await supabaseAdmin
      .from(TABLE)
      .update(row)
      .eq("id", id)
      .select()
      .single();

  if (error) throw error;

  return data;
}

export async function getById(id) {

  const { data, error } =
    await supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("id", id)
      .single();

  if (error) throw error;

  return data?.plan ?? data;
}

export async function listByProject({
  organization_id,
  creative_project_id,
}) {

  let query =
    supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("organization_id", organization_id)
      .order("created_at", {
        ascending: false,
      });

  if (creative_project_id) {
    query =
      query.eq(
        "creative_project_id",
        creative_project_id,
      );
  }

  const { data, error } =
    await query;

  if (error) throw error;

  return (data || []).map(
    row => row.plan ?? row,
  );
}
