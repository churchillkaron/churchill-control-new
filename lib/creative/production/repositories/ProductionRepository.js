import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_productions";

function productionPayload(values = {}) {
  const payload = {
    id: values.id,
    organization_id:
      values.organization_id || values.organizationId,
    creative_project_id:
      values.creative_project_id || values.creativeProjectId,
    execution_plan_id:
      values.execution_plan_id || values.executionPlanId,
    status: values.status,
    progress: values.progress,
    metadata: values.metadata,
    created_at: values.created_at,
    updated_at: values.updated_at,
  };

  return Object.fromEntries(
    Object.entries(payload).filter(
      ([, value]) => value !== undefined,
    ),
  );
}

export async function create(document = {}) {
  const payload = productionPayload(document);

  const { data, error } =
    await supabaseAdmin
      .from(TABLE)
      .insert(payload)
      .select()
      .single();

  if (error) throw error;

  return data;
}

export async function update(id, values = {}) {
  const payload = productionPayload({
    ...values,
    id: undefined,
    organization_id: undefined,
    creative_project_id: undefined,
    created_at: undefined,
    updated_at: new Date().toISOString(),
  });

  const { data, error } =
    await supabaseAdmin
      .from(TABLE)
      .update(payload)
      .eq("id", id)
      .select()
      .single();

  if (error) throw error;

  return data;
}

export async function get(id) {
  const { data, error } =
    await supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("id", id)
      .maybeSingle();

  if (error) throw error;

  return data || null;
}

export async function list({
  organization_id,
  creative_project_id,
} = {}) {
  let query =
    supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("organization_id", organization_id)
      .order("created_at", {
        ascending: false,
      });

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
