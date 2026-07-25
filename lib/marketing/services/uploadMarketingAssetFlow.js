import { uploadCampaignImage }
from "@/lib/marketing/repositories/uploadCampaignImage";

import { analyzeMarketingAsset }
from "@/lib/marketing/ai/assets/analyzeMarketingAsset";

import { saveMarketingAsset }
from "@/lib/marketing/repositories/saveMarketingAsset";

import { calculateAssetScore }
from "@/lib/ai/scoring/calculateAssetScore";

import { getOrCreateBusinessProfile }
from "@/lib/ai/profiles/getOrCreateBusinessProfile";

import {
  CreativeMediaInspectionRuntime,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";

function resolveMediaKind(mimeType = "") {
  const root = String(mimeType || "").toLowerCase().split("/")[0];
  return ["image", "video", "audio", "text", "application"].includes(root)
    ? root
    : "binary";
}

export async function uploadMarketingAssetFlow({
  organizationId,
  pageId = null,
  creativeMissionId = null,
  creativeProjectId = null,
  campaignId = null,
  file,
  assetType = null,
  name = null,
  source = "upload",
  restrictions = {},
  inspectionPolicy = {},
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!file) {
    throw new Error("file required");
  }

  const inspection = await CreativeMediaInspectionRuntime.inspect({
    file,
    file_name: file.name || name || null,
    mime_type: file.type || null,
    policy: inspectionPolicy,
  });

  const upload = await uploadCampaignImage({
    file,
    organizationId,
    creativeMissionId,
    creativeProjectId,
    source,
    detailed: true,
  });

  const mediaKind =
    inspection.technical?.media_kind ||
    resolveMediaKind(upload.mime_type);
  const technical = {
    ...inspection.technical,
    media_kind: mediaKind,
    mime_type: inspection.technical?.mime_type || upload.mime_type,
    extension: upload.extension,
    file_size_bytes:
      inspection.technical?.file_size_bytes ??
      upload.file_size_bytes,
    original_file_name:
      inspection.technical?.original_file_name ||
      upload.original_file_name,
    storage_path: upload.storage_path,
  };

  let analysis = {
    status: mediaKind === "image" ? "PENDING" : "PENDING",
    tags: [],
    media_kind: mediaKind,
    technical_status: inspection.status,
    technical_reason: inspection.reason,
  };

  if (mediaKind === "image") {
    const businessProfile = await getOrCreateBusinessProfile({
      organizationId,
    });

    const visualAnalysis = await analyzeMarketingAsset({
      fileUrl: upload.public_url,
      assetType: assetType || mediaKind,
      businessProfile,
    });

    analysis = {
      ...visualAnalysis,
      status:
        visualAnalysis?.status ||
        (visualAnalysis?.error ? "FAILED" : "COMPLETED"),
      media_kind: mediaKind,
      technical_status: inspection.status,
      technical_reason: inspection.reason,
    };
  }

  const score = calculateAssetScore({ analysis });
  const canonicalType =
    assetType ||
    analysis.sceneType ||
    analysis.scene_type ||
    mediaKind;

  const asset = await saveMarketingAsset({
    organizationId,
    pageId,
    campaignId,
    creativeMissionId,
    creativeProjectId,
    assetType: canonicalType,
    mediaKind,
    name: name || upload.original_file_name,
    fileUrl: upload.public_url,
    imageUrl: mediaKind === "image" ? upload.public_url : null,
    videoUrl: mediaKind === "video" ? upload.public_url : null,
    audioUrl: mediaKind === "audio" ? upload.public_url : null,
    analysis: {
      ...analysis,
      score,
    },
    technical,
    restrictions,
    score,
    metadata: {
      source,
      upload_asset_id: upload.asset_id,
      analysis_status: analysis.status,
      inspection_status: inspection.status,
      inspection_reason: inspection.reason,
    },
  });

  return {
    success: true,
    asset,
    analysis_status: analysis.status,
    inspection_status: inspection.status,
  };
}
