import { supabase } from "@/lib/supabase";

export async function createFixedAsset({
  tenantId,
  assetName,
  assetCategory,
  acquisitionDate,
  acquisitionCost,
  usefulLifeMonths,
  salvageValue,
}) {
  const netBookValue =
    Number(acquisitionCost || 0);

  const { data, error } =
    await supabase
      .from("fixed_assets")
      .insert({
        tenant_id: tenantId,
        asset_name: assetName,
        asset_category:
          assetCategory,
        acquisition_date:
          acquisitionDate,
        acquisition_cost:
          acquisitionCost,
        useful_life_months:
          usefulLifeMonths,
        salvage_value:
          salvageValue,
        net_book_value:
          netBookValue,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
