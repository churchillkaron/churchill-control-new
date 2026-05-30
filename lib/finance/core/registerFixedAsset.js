import { supabase } from "@/lib/supabase";

export async function registerFixedAsset(data) {
  const carryingValue =
    Number(data.acquisition_cost || 0);

  const { data: asset, error } =
    await supabase
      .from("fixed_asset_register")
      .insert({
        ...data,
        carrying_value:
          carryingValue,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return asset;
}
