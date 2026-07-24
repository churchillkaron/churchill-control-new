import * as Repository from "../repositories/CreativeAssetRepository";

import * as AssetGraphRepository from "../graph/repositories/CreativeAssetGraphRepository";

import {
  CreativeReferenceDeliveryRuntime,
} from "./CreativeReferenceDeliveryRuntime";

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map(String))];
}

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
    asset.technical?.mime_type ||
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
      asset.metadata?.creative_project_id ||
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
    metadata: {
      ...(asset.metadata || {}),
      reference_source:
        asset.metadata?.reference_source ||
        (asset.production_task_id || asset.storage_path
          ? "CREATIVE_ASSET_NODE"
          : "CREATIVE_ASSET"),
    },
  };
}

function mergeGraphNodeWithSource(node = {}, source = null) {
  if (!source) return node;

  const sourceMetadata = source.metadata || {};
  const nodeMetadata = node.metadata || {};
  const sourceAnalysis = source.analysis || {};
  const nodeIntelligence = node.intelligence || {};
  const sourceUrl = resolveUrl(source);
  const nodeUrl = resolveUrl(node);
  const canonicalId = node.id || source.id || null;
  const sourceAssetId = source.id || node.creative_asset_id || null;
  const referenceRoles = unique([
    ...list(node.reference_roles),
    ...list(node.reference_role),
    ...list(nodeMetadata.reference_roles),
    ...list(nodeMetadata.reference_role),
    ...list(nodeMetadata.evidence_roles),
    ...list(nodeMetadata.evidence_role),
    ...list(source.reference_roles),
    ...list(source.reference_role),
    ...list(sourceMetadata.reference_roles),
    ...list(sourceMetadata.reference_role),
    ...list(sourceMetadata.evidence_roles),
    ...list(sourceMetadata.evidence_role),
    ...list(sourceAnalysis.reference_roles),
    ...list(sourceAnalysis.reference_role),
    ...list(sourceAnalysis.evidence_roles),
    ...list(sourceAnalysis.evidence_role),
  ]);

  return {
    ...source,
    ...node,
    id: canonicalId,
    asset_id: canonicalId,
    creative_asset_id: sourceAssetId,
    source_asset_id: sourceAssetId,
    organization_id: node.organization_id || source.organization_id || null,
    creative_mission_id:
      node.creative_mission_id ||
      source.creative_mission_id ||
      source.campaign_id ||
      null,
    creative_project_id:
      node.creative_project_id ||
      source.creative_project_id ||
      sourceMetadata.creative_project_id ||
      null,
    name: node.name || source.name || source.title || source.file_name || null,
    title: node.title || source.title || source.name || source.file_name || null,
    description: node.description || source.description || "",
    asset_type: node.type || source.asset_type || source.type || "UPLOADED",
    type: node.type || source.type || source.asset_type || "IMAGE",
    url: nodeUrl || sourceUrl,
    file_url: node.file_url || nodeUrl || source.file_url || sourceUrl,
    image_url: node.image_url || nodeUrl || source.image_url || sourceUrl,
    thumbnail_url:
      node.thumbnail_url ||
      nodeUrl ||
      source.thumbnail_url ||
      source.image_url ||
      sourceUrl,
    tags: unique([
      ...list(node.tags),
      ...list(nodeIntelligence.tags),
      ...list(source.tags),
      ...list(sourceAnalysis.tags),
    ]),
    analysis: {
      ...sourceAnalysis,
      ...nodeIntelligence,
      source_asset_id: sourceAssetId,
    },
    reference_roles: referenceRoles,
    approved_reference:
      node.approved_reference === true ||
      node.review?.approved === true ||
      source.approved_reference === true ||
      source.archived !== true,
    metadata: {
      ...sourceMetadata,
      ...nodeMetadata,
      source_asset_id: sourceAssetId,
      source_asset_metadata_preserved: true,
      reference_roles: unique([
        ...list(sourceMetadata.reference_roles),
        ...list(nodeMetadata.reference_roles),
        ...referenceRoles,
      ]),
      evidence_roles: unique([
        ...list(sourceMetadata.evidence_roles),
        ...list(nodeMetadata.evidence_roles),
        ...referenceRoles,
      ]),
      reference_source:
        nodeMetadata.reference_source ||
        sourceMetadata.reference_source ||
        "CREATIVE_ASSET_NODE_WITH_SOURCE",
    },
  };
}

async function normalizeForDelivery(asset = null) {
  if (!asset) return null;

  const normalized = normalize(asset);
  const delivered = await CreativeReferenceDeliveryRuntime.resolve(
    normalized,
    {
      expires_in: 3600,
    },
  );

  return normalize(delivered || normalized);
}

async function resolveStoredAsset(id) {
  const uploaded = await Repository.get(id);
  if (uploaded) return uploaded;

  const node = await AssetGraphRepository.get(id);
  if (!node) return null;

  if (!node.creative_asset_id) return node;

  try {
    const source = await Repository.get(node.creative_asset_id);
    return mergeGraphNodeWithSource(node, source);
  } catch {
    return node;
  }
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

function normalizeUpdateInput(values = {}) {
  const output = { ...values };
  const url = resolveUrl(values);

  if (
    "organizationId" in values ||
    "organization_id" in values
  ) {
    output.organization_id =
      values.organization_id || values.organizationId || null;
  }

  if (
    "creativeMissionId" in values ||
    "creative_mission_id" in values ||
    "campaignId" in values ||
    "campaign_id" in values
  ) {
    output.creative_mission_id =
      values.creative_mission_id ||
      values.creativeMissionId ||
      values.campaign_id ||
      values.campaignId ||
      null;
  }

  if (
    "creativeProjectId" in values ||
    "creative_project_id" in values ||
    "projectId" in values ||
    "project_id" in values
  ) {
    output.metadata = {
      ...(values.metadata || {}),
      creative_project_id:
        values.creative_project_id ||
        values.creativeProjectId ||
        values.project_id ||
        values.projectId ||
        null,
    };
  }

  if (
    "assetType" in values ||
    "asset_type" in values ||
    "type" in values
  ) {
    output.asset_type =
      values.asset_type ||
      values.assetType ||
      values.type ||
      "UPLOADED";
  }

  if (url) {
    output.file_url = values.file_url || values.fileUrl || url;
    output.image_url = values.image_url || values.imageUrl || url;
    output.thumbnail_url =
      values.thumbnail_url || values.thumbnailUrl || url;
  }

  if ("fileName" in values) {
    output.file_name = values.fileName;
  }

  if ("aiGenerated" in values) {
    output.ai_generated = Boolean(values.aiGenerated);
  }

  if ("aiSuggestedType" in values) {
    output.ai_suggested_type = values.aiSuggestedType;
  }

  if ("pageId" in values) {
    output.page_id = values.pageId;
  }

  delete output.organizationId;
  delete output.creativeMissionId;
  delete output.creativeProjectId;
  delete output.campaignId;
  delete output.projectId;
  delete output.assetType;
  delete output.fileUrl;
  delete output.imageUrl;
  delete output.thumbnailUrl;
  delete output.fileName;
  delete output.aiGenerated;
  delete output.aiSuggestedType;
  delete output.pageId;
  delete output.url;

  return output;
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
    if (!id) return null;

    const asset = await resolveStoredAsset(id);
    return normalizeForDelivery(asset);
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
        normalizeUpdateInput(values),
      ),
    );
  },

  remove: Repository.remove,
  incrementUsage: Repository.incrementUsage,
};
