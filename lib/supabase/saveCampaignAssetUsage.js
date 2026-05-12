import { supabase }
from "@/lib/shared/supabase/client";

export async function saveCampaignAssetUsage({

  tenantId,

  pageId,

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

        tenant_id:
          tenantId,

        page_id:
          pageId,

        campaign_id:
          campaignId,

        asset_id:
          asset.id,

        asset_type:
          asset.asset_type,

        asset_name:
          asset.name,

        usage_count: 1,

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