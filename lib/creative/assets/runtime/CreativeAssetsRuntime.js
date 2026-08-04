import * as Repository from "../repositories/CreativeAssetRepository";
import * as CreativeProjectRepository
from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import * as CreativeAssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  mergeCreativeAssetNodeEvidence,
} from "@/lib/creative/assets/intelligence/planner/mergeCreativeAssetNodeEvidence";

function text(value) {
  return String(value || "").trim();
}

function assetKind(asset = {}, url = "") {
  const mime = text(
    asset.mime_type ||
    asset.metadata?.mime_type ||
    asset.analysis?.mime_type,
  ).toLowerCase();
  const type = text(asset.asset_type || asset.type).toLowerCase();
  const source = text(url).toLowerCase();

  if (mime.startsWith("video/") || type.includes("video") || /\.(mp4|mov|m4v|webm)(\?|$)/.test(source)) {
    return "video";
  }
  if (mime.startsWith("audio/") || type.includes("audio") || /\.(mp3|wav|m4a|aac|flac|ogg)(\?|$)/.test(source)) {
    return "audio";
  }
  if (mime === "application/pdf" || type.includes("document") || /\.pdf(\?|$)/.test(source)) {
    return "document";
  }
  if (mime.startsWith("image/") || type.includes("image")) return "image";
  return "file";
}

function normalize(asset) {
  const url =
    asset.file_url ||
    asset.image_url ||
    asset.thumbnail_url ||
    null;
  const kind = assetKind(asset, url);

  return {
    ...asset,
    url,
    isVideo: kind === "video",
    previewType: kind,
    analysis_status:
      asset.analysis?.status ||
      asset.metadata?.analysis_status ||
      (Object.keys(asset.analysis || {}).length ? "ANALYSED" : "UNVERIFIED"),
  };
}

function uniqueById(assets = []) {
  return [...new Map(
    assets
      .filter(Boolean)
      .map((asset) => [asset.id, asset]),
  ).values()];
}

async function mergeProjectNodeEvidence({
  assets,
  organization_id,
  creative_project_id,
}) {
  const nodes = await CreativeAssetGraphRepository.listByProject({
    organization_id,
    creative_project_id,
  });

  return mergeCreativeAssetNodeEvidence({
    assets,
    nodes,
    creative_project_id,
  });
}

export const CreativeAssetsRuntime = {
  async list(params = {}) {
    const projectId =
      params.creative_project_id ||
      params.creativeProjectId ||
      null;
    const direct = await Repository.list(params);

    if (!projectId) {
      return uniqueById(direct).map(normalize);
    }

    const project = await CreativeProjectRepository.getById(projectId);
    if (!project) return uniqueById(direct).map(normalize);

    const organizationId =
      params.organization_id ||
      params.organizationId ||
      project.organization_id;
    if (String(project.organization_id) !== String(organizationId)) {
      throw new Error("Creative project not found in organization scope");
    }

    const selectedIds = new Set(
      Array.isArray(project.metadata?.selected_asset_ids)
        ? project.metadata.selected_asset_ids.map(text).filter(Boolean)
        : [],
    );
    if (!selectedIds.size) {
      const merged = await mergeProjectNodeEvidence({
        assets: uniqueById(direct),
        organization_id: organizationId,
        creative_project_id: projectId,
      });
      return merged.map(normalize);
    }

    const organizationAssets = await Repository.list({
      organization_id: organizationId,
      limit: Math.max(Number(params.limit || 200), selectedIds.size, 1000),
    });
    const selected = organizationAssets.filter((asset) => selectedIds.has(text(asset.id)));
    const foundIds = new Set(selected.map((asset) => text(asset.id)));
    const missing = [...selectedIds].filter((id) => !foundIds.has(id));
    if (missing.length) {
      throw new Error(`CREATIVE_SELECTED_ASSETS_MISSING:${missing.join(",")}`);
    }

    const merged = await mergeProjectNodeEvidence({
      assets: uniqueById([...direct, ...selected]),
      organization_id: organizationId,
      creative_project_id: projectId,
    });

    return merged.map(normalize);
  },

  get: Repository.get,
  create: Repository.create,
  update: Repository.update,
  remove: Repository.remove,
  incrementUsage: Repository.incrementUsage,
};
