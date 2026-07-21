import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_research_reports";

function normalizeProjectField(values = {}) {
  const normalized = {
    ...values,
  };

  if (!normalized.project_id && normalized.creative_project_id) {
    normalized.project_id = normalized.creative_project_id;
  }

  delete normalized.creative_project_id;

  return normalized;
}

export async function create(report = {}) {
  const payload = normalizeProjectField(report);

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
  const payload = normalizeProjectField(values);

  delete payload.id;

  const { data, error } =
    await supabaseAdmin
      .from(TABLE)
      .update({
        ...payload,
        updated_at:
          new Date().toISOString(),
      })
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
      .single();

  if (error) throw error;

  return data;
}

export async function list({
  organization_id,
  creative_project_id,
  project_id,
} = {}) {
  const resolvedProjectId =
    project_id || creative_project_id || null;

  let query =
    supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("organization_id", organization_id)
      .order("created_at", {
        ascending: false,
      });

  if (resolvedProjectId) {
    query = query.eq(
      "project_id",
      resolvedProjectId,
    );
  }

  const { data, error } =
    await query;

  if (error) throw error;

  return data || [];
}
