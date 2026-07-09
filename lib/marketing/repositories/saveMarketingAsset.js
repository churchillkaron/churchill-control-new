import { getServiceSupabase } from "@/lib/shared/supabase/service";

const supabaseAdmin = getServiceSupabase();

export async function saveMarketingAsset({
  organizationId,
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
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const payload = {
    organization_id: organizationId,
    page_id: pageId,
    campaign_id: campaignId,
    asset_type: assetType,
    ai_suggested_type: aiSuggestedType,
    name,
    image_url: imageUrl,
    file_url: imageUrl,
    thumbnail_url: thumbnailUrl || imageUrl,
    analysis,
    score,
    performance_score: score,
    ai_generated: aiGenerated,
    provider,
    metadata: {
      ...metadata,
      source: metadata?.source || "MARKETING",
    },
    tags: analysis?.tags || [],
  };

  const { data, error } =
    await supabaseAdmin
      .from("creative_assets")
      .insert(payload)
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
