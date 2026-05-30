import { supabase } from "@/lib/supabase";

import { postAutomaticJournal } from "@/lib/finance/core/postAutomaticJournal";

export async function runAssetDepreciation({
  tenantId,
  assetId,
  depreciationDate,
}) {
  const asset =
    await supabase
      .from("fixed_assets")
      .select("*")
      .eq("id", assetId)
      .single();

  if (!asset.data) {
    throw new Error(
      "Asset not found"
    );
  }

  const monthly =
    (
      Number(
        asset.data
          .acquisition_cost || 0
      ) -
      Number(
        asset.data
          .salvage_value || 0
      )
    ) /
    Number(
      asset.data
        .useful_life_months || 1
    );

  const accumulated =
    Number(
      asset.data
        .accumulated_depreciation ||
        0
    ) + monthly;

  const remaining =
    Number(
      asset.data
        .acquisition_cost || 0
    ) - accumulated;

  const depreciation =
    await supabase
      .from(
        "fixed_asset_depreciation"
      )
      .insert({
        tenant_id: tenantId,
        asset_id: assetId,
        depreciation_date:
          depreciationDate,
        depreciation_amount:
          monthly,
        accumulated_depreciation:
          accumulated,
        remaining_book_value:
          remaining,
      })
      .select()
      .single();

  await supabase
    .from("fixed_assets")
    .update({
      accumulated_depreciation:
        accumulated,
      net_book_value:
        remaining,
    })
    .eq("id", assetId);

  await postAutomaticJournal({
    tenantId,
    journalDate:
      depreciationDate,
    referenceType:
      "DEPRECIATION",
    referenceId:
      assetId,
    debitAccount:
      "6100_DEPRECIATION_EXPENSE",
    creditAccount:
      "1700_ACCUMULATED_DEPRECIATION",
    amount: monthly,
    description:
      "Asset depreciation posted",
  });

  return depreciation.data;
}
