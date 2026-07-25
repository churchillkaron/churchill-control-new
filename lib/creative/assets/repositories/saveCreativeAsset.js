import { getServiceSupabase } from "@/lib/shared/supabase/service";

const supabaseAdmin = getServiceSupabase();

export async function saveCreativeAsset({
  organizationId,
  pageId = null,
  creativeMissionId = null,
  assetType = "uploaded",
  name = null,
  imageUrl,
  thumbnailUrl = null,
  aiSuggestedType = null,
  analysis = {},
  score = 0,
  aiGenerated = false,
  provider = null,
  metadata = {},
  originalFileName = null,
  originalContentType = null,
  uploadedBy = null,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const generated = Boolean(
    aiGenerated ||
    provider ||
    metadata?.production_task_id ||
    metadata?.source_task_id,
  );
  const sourceKind = generated ? "GENERATED_OUTPUT" : "USER_UPLOAD";

  const payload = {
    organization_id: organizationId,
    page_id: pageId,
    creative_mission_id: creativeMissionId,
    asset_type: assetType,
    ai_suggested_type: aiSuggestedType,
    name,
    image_url: imageUrl,
    file_url: imageUrl,
    thumbnail_url: thumbnailUrl || imageUrl,
    analysis,
    score,
    performance_score: score,
    ai_generated: generated,
    provider,
    metadata: {
      ...metadata,
      // CREATIVE_DURABLE_UPLOAD_PROVENANCE_V11
      source: metadata?.source || (
        generated
          ? "CREATIVE_PRODUCTION"
          : "CREATIVE_ASSET_UPLOAD"
      ),
      source_kind: sourceKind,
      source_type: metadata?.source_type || (
        generated
          ? "PRODUCTION_OUTPUT"
          : "MANUAL_UPLOAD"
      ),
      origin: metadata?.origin || (
        generated
          ? "CREATIVE_RUNTIME"
          : "ORGANIZATION_USER"
      ),
      original_file_name:
        originalFileName || metadata?.original_file_name || null,
      original_content_type:
        originalContentType || metadata?.original_content_type || null,
      uploaded_by:
        uploadedBy || metadata?.uploaded_by || null,
      uploaded_at:
        generated
          ? metadata?.uploaded_at || null
          : metadata?.uploaded_at || new Date().toISOString(),
    },
    tags: analysis?.tags || [],
  };

  const { data, error } = await supabaseAdmin
    .from("creative_assets")
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}
