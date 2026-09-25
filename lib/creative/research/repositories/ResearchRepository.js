import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_research_reports";

export async function create(report) {

  const { data, error } =
    await supabaseAdmin
      .from(TABLE)
      .insert(report)
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
}) {

  let query =
    supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("organization_id", organization_id)
      .order("created_at", {
        ascending: false,
      });

  if (creative_project_id)
    query =
      query.eq(
        "creative_project_id",
        creative_project_id,
      );

  const { data, error } =
    await query;

  if (error) throw error;

  return data || [];

}

export async function listCertificationMetadata({
  organization_id,
  creative_project_id,
  limit = 25,
}) {
  let query =
    supabaseAdmin
      .from(TABLE)
      .select("id,metadata,created_at,updated_at")
      .eq("organization_id", organization_id)
      .order("created_at", {
        ascending: false,
      })
      .limit(Math.min(Math.max(Number(limit) || 25, 1), 100));

  if (creative_project_id)
    query =
      query.eq(
        "creative_project_id",
        creative_project_id,
      );

  const { data, error } =
    await query;

  if (error) throw error;

  return data || [];
}
