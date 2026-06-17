import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";
import { postAutomaticJournal } from "@/lib/finance/core/postAutomaticJournal";

export async function runAssetDepreciation({
  tenantId,
  assetId,
  depreciationDate,
}) {
  const asset = await supabase
    .from("fixed_assets")
    .select("*")
    .eq("id", assetId)
    .single();

  if (asset.error || !asset.data) {
    throw new Error("Asset not found");
  }

  const acquisitionCost = Number(
    asset.data.acquisition_cost ||
      asset.data.purchase_cost ||
      0
  );

  const salvageValue = Number(
    asset.data.salvage_value || 0
  );

  const usefulLifeMonths = Number(
    asset.data.useful_life_months ||
      Number(asset.data.useful_life_years || 5) * 12 ||
      1
  );

  const monthly =
    (acquisitionCost - salvageValue) /
    usefulLifeMonths;

  const accumulated =
    Number(asset.data.accumulated_depreciation || 0) +
    monthly;

  const remaining = Math.max(
    acquisitionCost - accumulated,
    salvageValue
  );

  const depreciation = await supabase
    .from("fixed_asset_depreciation")
    .insert({
      tenant_id: tenantId,
      asset_id: assetId,
      depreciation_date: depreciationDate,
      depreciation_amount: monthly,
      accumulated_depreciation: accumulated,
      remaining_book_value: remaining,
    })
    .select()
    .single();

  if (depreciation.error) {
    throw depreciation.error;
  }

  await supabase
    .from("fixed_assets")
    .update({
      accumulated_depreciation: accumulated,
      net_book_value: remaining,
      current_book_value: remaining,
    })
    .eq("id", assetId);

  await postAutomaticJournal({
    tenantId,
    journalDate: depreciationDate,
    referenceType: "DEPRECIATION",
    referenceId: assetId,
    debitAccount: "6110",
    creditAccount: "1590",
    amount: monthly,
    description: "Asset depreciation posted",
    createdBy: "system",
  });

  return depreciation.data;
}
