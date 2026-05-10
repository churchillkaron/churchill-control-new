import { supabase }
from "@/lib/supabase";

export async function incrementAssetUsage({

  assetId,

}) {

  const {
    data: asset,
  } = await supabase
    .from(
      "marketing_assets"
    )
    .select("usage_count")
    .eq("id", assetId)
    .single();

  const current =
    asset?.usage_count || 0;

  await supabase
    .from(
      "marketing_assets"
    )
    .update({

      usage_count:
        current + 1,

    })
    .eq(
      "id",
      assetId
    );

}