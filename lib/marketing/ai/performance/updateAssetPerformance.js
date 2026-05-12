import { supabase }
from "@/lib/shared/supabase/client";

export async function updateAssetPerformance({

  assets = [],

  campaignScore = 0,

}) {

  for (const asset of assets) {

    const currentScore =
      asset.score || 0;

    const boost =
      Math.round(
        campaignScore * 0.05
      );

    await supabase
      .from(
        "marketing_assets"
      )
      .update({

        score:
          currentScore +
          boost,

      })
      .eq(
        "id",
        asset.id
      );

  }

}