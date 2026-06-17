import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function disposeFixedAsset({
  tenantId,
  assetId,
  disposalDate,
  disposalAmount,
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

  const gainLoss =
    Number(disposalAmount || 0) -
    Number(
      asset.data
        .net_book_value || 0
    );

  const disposal =
    await supabase
      .from(
        "fixed_asset_disposals"
      )
      .insert({
        tenant_id: tenantId,
        asset_id: assetId,
        disposal_date:
          disposalDate,
        disposal_amount:
          disposalAmount,
        gain_loss_amount:
          gainLoss,
      })
      .select()
      .single();

  await supabase
    .from("fixed_assets")
    .update({
      asset_status:
        "disposed",
    })
    .eq("id", assetId);

  return disposal.data;
}
