import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function runDepreciation(asset) {
  const yearly =
    (Number(asset.purchase_cost || 0) -
      Number(asset.salvage_value || 0)) /
    Number(asset.useful_life_years || 1);

  const monthly = yearly / 12;

  const { data, error } = await supabase
    .from("depreciation_entries")
    .insert({
      tenant_id: asset.tenant_id,
      fixed_asset_id: asset.id,
      depreciation_date: new Date().toISOString(),
      depreciation_amount: monthly,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}
