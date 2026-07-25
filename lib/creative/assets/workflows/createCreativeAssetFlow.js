import { uploadCreativeAsset }
from "@/lib/creative/assets/storage/uploadCreativeAsset";

import { analyzeCreativeAsset }
from "@/lib/creative/assets/intelligence/analyzeCreativeAsset";

import { saveCreativeAsset }
from "@/lib/creative/assets/repositories/saveCreativeAsset";

import { analyzeCreativeSubject }
from "@/lib/creative/assets/intelligence/analyzeCreativeSubject";

import { calculateAssetScore }
from "@/lib/ai/scoring/calculateAssetScore";

import { getOrCreateBusinessProfile }
from "@/lib/ai/profiles/getOrCreateBusinessProfile";

function neutralSuggestedType({ assetType, analysis, identityData }) {
  if (identityData) return "person";

  return String(
    assetType ||
    analysis?.classification ||
    analysis?.sceneType ||
    analysis?.subjectType ||
    "reference",
  )
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "reference";
}

export async function createCreativeAssetFlow({
  organizationId,
  pageId,
  file,
  assetType,
  name,
  uploadedBy = null,
}) {
  try {
    const uploadedImageUrl = await uploadCreativeAsset({
      file,
      organizationId,
    });

    const businessProfile = await getOrCreateBusinessProfile({
      organizationId,
    });

    const analysis = await analyzeCreativeAsset({
      fileUrl: uploadedImageUrl,
      assetType,
      businessProfile,
    });

    let identityData = null;

    if (String(assetType || "").toLowerCase() === "person") {
      identityData = await analyzeCreativeSubject({
        imageUrl: uploadedImageUrl,
        organizationId,
      });
    }

    const suggestedType = neutralSuggestedType({
      assetType,
      analysis,
      identityData,
    });

    const score = calculateAssetScore({
      analysis: {
        ...analysis,
        identity: identityData,
      },
    });

    const asset = await saveCreativeAsset({
      organizationId,
      pageId,
      assetType: assetType || suggestedType,
      name,
      imageUrl: uploadedImageUrl,
      aiSuggestedType: suggestedType,
      score,
      analysis: {
        ...analysis,
        identity: identityData,
        score,
      },
      aiGenerated: false,
      originalFileName: file?.name || null,
      originalContentType: file?.type || null,
      uploadedBy,
      metadata: {
        // CREATIVE_UPLOAD_FLOW_PROVENANCE_V11
        source: "CREATIVE_ASSET_UPLOAD",
        source_kind: "USER_UPLOAD",
        source_type: "MANUAL_UPLOAD",
        origin: "ORGANIZATION_USER",
      },
    });

    return {
      success: true,
      asset,
    };
  } catch (err) {
    console.error("UPLOAD CREATIVE ASSET FLOW ERROR:", err);
    throw err;
  }
}
