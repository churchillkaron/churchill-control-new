import { getServiceSupabase }
from "@/lib/shared/supabase/service";

const supabaseAdmin =
  getServiceSupabase();
export async function saveMarketingAsset({

  tenantId,

  pageId = null,

  campaignId = null,

  assetType = "generated_campaign",

  name = null,

  imageUrl,

  thumbnailUrl = null,

  aiSuggestedType = null,

  analysis = {},

  score = 0,

  aiGenerated = false,

  provider = null,

  metadata = {},

}) {

  try {

    const payload = {

      tenant_id:
        tenantId,

      page_id:
        pageId,

      campaign_id:
        campaignId,

      asset_type:
        assetType,

      ai_suggested_type:
        aiSuggestedType,

      name,

      image_url:
        imageUrl,

      thumbnail_url:
        thumbnailUrl ||
        imageUrl,

      analysis,

      score,

      ai_generated:
        aiGenerated,

      provider,

      metadata,

      tags:
        analysis?.tags || [],

    };

    const {

      data,

      error,

    } = await supabaseAdmin

      .from(
        "marketing_assets"
      )

      .insert(payload)

      .select()

      .single();

    if (error) {

      console.error(
        "SAVE MARKETING ASSET ERROR:",
        error
      );

      throw error;

    }

    return data;

  } catch (err) {

    console.error(
      "SAVE MARKETING ASSET FAILED:",
      err
    );

    throw err;

  }

}