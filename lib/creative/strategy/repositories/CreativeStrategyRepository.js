import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_strategies";

export async function create(document) {

  const { data, error } =
    await supabaseAdmin
      .from(TABLE)
      .insert(document)
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
      .order("created_at");

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
