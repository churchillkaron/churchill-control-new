import * as Repository from "../repositories/CreativeAssetRepository";

function resolveUrl(asset = {}) {
  return (
    asset.url ||
    asset.image_url ||
    asset.imageUrl ||
    asset.file_url ||
    asset.fileUrl ||
    asset.thumbnail_url ||
    asset.thumbnailUrl ||
    null
  );
}

function normalize(asset = {}) {
  const url = resolveUrl(asset);
  const mimeType = String(
    asset.metadata?.mime_type ||
    asset.mime_type ||
    "",
  ).toLowerCase();
  const lowerUrl = String(url || "").toLowerCase();
  const isVideo =
    mimeType.startsWith("video/") ||
    [".mp4", ".mov", ".webm", ".m4v"].some(
      (extension) => lowerUrl.includes(extension),
    );

  return {
    ...asset,
    organization_id:
      asset.organization_id || asset.organizationId || null,
    creative_mission_id:
      asset.creative_mission_id ||
      asset.creativeMissionId ||
      asset.campaign_id ||
      asset.campaignId ||
      null,
    creative_project_id:
      asset.creative_project_id ||
      asset.creativeProjectId ||
      asset.project_id ||
      asset.projectId ||
      null,
    asset_type:
      asset.asset_type || asset.assetType || asset.type || "UPLOADED",
    file_url: asset.file_url || asset.fileUrl || url,
    image_url: asset.image_url || asset.imageUrl || url,
    thumbnail_url:
      asset.thumbnail_url || asset.thumbnailUrl || url,
    url,
    isVideo,
    previewType: isVideo ? "video" : "image",
  };
}

function normalizeCreateInput(asset = {}) {
  const normalized = normalize(asset);

  return {
    ...asset,
    organization_id: normalized.organization_id,
    creative_mission_id: normalized.creative_mission_id,
    creative_project_id: normalized.creative_project_id,
    campaign_id:
      asset.campaign_id || asset.campaignId || null,
    asset_type: normalized.asset_type,
    file_url: normalized.file_url,
    image_url: normalized.image_url,
    thumbnail_url: normalized.thumbnail_url,
    file_name: asset.file_name || asset.fileName || null,
    name: asset.name || null,
    title: asset.title || null,
    ai_generated:
      asset.ai_generated ?? asset.aiGenerated ?? false,
    ai_suggested_type:
      asset.ai_suggested_type || asset.aiSuggestedType || null,
    page_id: asset.page_id || asset.pageId || null,
  };
}

export const CreativeAssetsRuntime = {
  async list(params = {}) {
    const data = await Repository.list({
      organization_id:
        params.organization_id || params.organizationId,
      creative_mission_id:
        params.creative_mission_id || params.creativeMissionId,
      creative_project_id:
        params.creative_project_id || params.creativeProjectId,
      campaign_id:
        params.campaign_id || params.campaignId,
      asset_type:
        params.asset_type || params.assetType,
      page_id:
        params.page_id || params.pageId,
      limit: params.limit,
    });

    return (data || []).map(normalize);
  },

  async get(id) {
    return normalize(await Repository.get(id));
  },

  async create(input = {}) {
    return normalize(
      await Repository.create(normalizeCreateInput(input)),
    );
  },

  async update(id, values = {}) {
    return normalize(
      await Repository.update(
        id,
        normalizeCreateInput(values),
      ),
    );
  },

  remove: Repository.remove,
  incrementUsage: Repository.incrementUsage,
};
