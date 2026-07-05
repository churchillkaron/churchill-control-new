import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function runDepreciation(asset) {
  const yearly =
    (Number(asset.purchase_cost || 0) -
      Number(asset.salvage_value || 0)) /
    Number(asset.useful_life_years || 1);

  const monthly = yearly / 12;

  const { data, error } = await supabaseAdmin
    .from("depreciation_entries")
    .insert({
      organization_id: asset.organization_id,
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
