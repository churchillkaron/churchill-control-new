import { supabase } from "@/lib/supabase";

export async function createFixedAsset(data) {
  const { data: asset, error } = await supabase
    .from("fixed_assets")
    .insert(data)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return asset;
}
