import { supabase }
from "@/lib/supabase";

export async function saveCampaignAssetUsage({

  campaignId,

  assets,

}) {

  try {

    if (
      !campaignId ||
      !assets?.length
    ) {

      return;

    }

    const rows =
      assets.map((asset) => ({

        campaign_id:
          campaignId,

        asset_id:
          asset.id,

      }));

    const {
      error,
    } = await supabase
      .from(
        "campaign_asset_usage"
      )
      .insert(rows);

    if (error) {

      throw error;

    }

  } catch (err) {

    console.error(
      "SAVE CAMPAIGN ASSET USAGE ERROR:",
      err
    );

  }

}