import { supabase }
from "@/lib/supabase";

export async function saveMarketingAsset({

  tenantId,

  pageId,

  assetType,

  name,

  imageUrl,

  analysis,

  score = 0,

}) {

  const {
    data,
    error,
  } = await supabase
    .from(
      "marketing_assets"
    )
    .insert({

      tenant_id:
        tenantId,

      page_id:
        pageId,

      asset_type:
        assetType,

      name,

      image_url:
        imageUrl,

      analysis,

      score,

      tags:
        analysis.tags || [],

    })
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

}