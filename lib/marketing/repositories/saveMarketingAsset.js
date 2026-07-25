import { getServiceSupabase } from "@/lib/shared/supabase/service";

const supabaseAdmin = getServiceSupabase();

export async function saveMarketingAsset({
  organizationId,
  pageId = null,
  campaignId = null,
  creativeMissionId = null,
  creativeProjectId = null,
  assetType = null,
  mediaKind = null,
  name = null,
  fileUrl = null,
  imageUrl = null,
  videoUrl = null,
  audioUrl = null,
  thumbnailUrl = null,
  aiSuggestedType = null,
  analysis = {},
  technical = {},
  restrictions = {},
  score = 0,
  aiGenerated = false,
  provider = null,
  metadata = {},
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const canonicalUrl = fileUrl || videoUrl || audioUrl || imageUrl || thumbnailUrl;
  if (!canonicalUrl) {
    throw new Error("A media URL is required");
  }

  const canonicalMediaKind = mediaKind || technical.media_kind || null;
  const payload = {
    organization_id: organizationId,
    page_id: pageId,
    campaign_id: campaignId,
    creative_mission_id: creativeMissionId,
    creative_project_id: creativeProjectId,
    asset_type: assetType || canonicalMediaKind || "asset",
    ai_suggested_type: aiSuggestedType,
    name,
    image_url: canonicalMediaKind === "image" ? (imageUrl || canonicalUrl) : imageUrl,
    file_url: canonicalUrl,
    thumbnail_url: thumbnailUrl || (canonicalMediaKind === "image" ? canonicalUrl : null),
    analysis,
    score: Number(score || 0),
    performance_score: Number(score || 0),
    ai_generated: Boolean(aiGenerated),
    provider,
    metadata: {
      ...metadata,
      media_kind: canonicalMediaKind,
      technical,
      restrictions,
      source: metadata?.source || "creative_upload",
    },
    tags: Array.isArray(analysis?.tags) ? analysis.tags : [],
  };

  const { data, error } = await supabaseAdmin
    .from("creative_assets")
    .insert(payload)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}
