import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_asset_nodes";

export async function create(node) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert(node)
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
  return data || [];
}

export async function findReusable({
  organization_id,
  type,
  tags = [],
}) {
  let query = supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .eq("reuse->>approved_for_reuse", "true")
    .order("created_at", { ascending: false });

  if (type) {
    query = query.eq("type", type);
  }

  const { data, error } = await query;

  if (error) throw error;

  if (!tags.length) return data || [];

  return (data || []).filter((row) => {
    const rowTags = row?.intelligence?.tags || [];
    return tags.some((tag) => rowTags.includes(tag));
  });
}
