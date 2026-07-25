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
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!file) {
    throw new Error("file required");
  }

  const upload = await uploadCampaignImage({
    file,
    organizationId,
    creativeMissionId,
    creativeProjectId,
    source,
    detailed: true,
  });

  const mediaKind = resolveMediaKind(upload.mime_type);
  const technical = {
    media_kind: mediaKind,
    mime_type: upload.mime_type,
    extension: upload.extension,
    file_size_bytes: upload.file_size_bytes,
    original_file_name: upload.original_file_name,
    storage_path: upload.storage_path,
  };

  let analysis = {
    status: "PENDING",
    tags: [],
    media_kind: mediaKind,
  };

  if (mediaKind === "image") {
    const businessProfile = await getOrCreateBusinessProfile({
      organizationId,
    });

    analysis = {
      ...await analyzeMarketingAsset({
        fileUrl: upload.public_url,
        assetType: assetType || mediaKind,
        businessProfile,
      }),
      status: "COMPLETED",
      media_kind: mediaKind,
    };
  }

  const score = calculateAssetScore({ analysis });
  const canonicalType = assetType || analysis.sceneType || analysis.scene_type || mediaKind;

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
    },
  });

  return {
    success: true,
    asset,
    analysis_status: analysis.status,
  };
}
