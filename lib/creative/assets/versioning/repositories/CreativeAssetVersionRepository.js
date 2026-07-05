import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_asset_versions";

export async function create(version) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert(version)
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function listByAsset(parent_asset_id) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("parent_asset_id", parent_asset_id)
    .order("version", {
      ascending: true,
    });

  if (error) throw error;

  return data || [];
}

export async function latest(parent_asset_id) {
  const versions =
    await listByAsset(parent_asset_id);

  return (
    versions.at(-1) || null
  );
}
