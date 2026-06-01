import { uploadCampaignImage }
from "@/lib/marketing/repositories/uploadCampaignImage";

import { analyzeMarketingAsset }
from "@/lib/marketing/ai/assets/analyzeMarketingAsset";

import { saveMarketingAsset }
from "@/lib/marketing/repositories/saveMarketingAsset";

import { extractFaceIdentity }
from "@/lib/marketing/ai/identity/extractFaceIdentity";

import { calculateAssetScore }
from "@/lib/marketing/ai/scoring/calculateAssetScore";

export async function uploadMarketingAssetFlow({

  tenantId,

  pageId,

  file,

  assetType,

  name,

}) {

  try {

    // =====================================
    // UPLOAD IMAGE
    // =====================================

    const uploadedImageUrl =
      await uploadCampaignImage({

        file,

        tenantId,

      });

    // =====================================
    // AI ANALYSIS
    // =====================================

    const analysis =
      await analyzeMarketingAsset({

        fileUrl:
          uploadedImageUrl,

        assetType,

      });

    // =====================================
    // FACE / STAFF IDENTITY
    // =====================================

    let identityData =
      null;

    if (
      assetType === "staff"
    ) {

      identityData =
        await extractFaceIdentity({

          imageUrl:
            uploadedImageUrl,

        });

    }

    // =====================================
    // AI TYPE DETECTION
    // =====================================

    let suggestedType =
      "venue";

    if (
      identityData
        ?.hospitality_role
    ) {

      suggestedType =
        "staff";

    } else if (

      analysis?.sceneType
        ?.toLowerCase()
        ?.includes(
          "cocktail"
        )

    ) {

      suggestedType =
        "cocktail";

    } else if (

      analysis?.sceneType
        ?.toLowerCase()
        ?.includes(
          "food"
        )

    ) {

      suggestedType =
        "food";

    } else if (

      analysis?.sceneType
        ?.toLowerCase()
        ?.includes(
          "interior"
        )

    ) {

      suggestedType =
        "interior";

    }

    // =====================================
    // SCORE
    // =====================================

    const score =
      calculateAssetScore({

        analysis: {

          ...analysis,

          identity:
            identityData,

        },

      });

    // =====================================
    // SAVE ASSET
    // =====================================

    const asset =
      await saveMarketingAsset({

        tenantId,

        pageId,

        assetType:
          assetType ||
          suggestedType,

        name,

        imageUrl:
          uploadedImageUrl,

        aiSuggestedType:
          suggestedType,

        score,

        analysis: {

          ...analysis,

          identity:
            identityData,

          score,

        },

      });

    return {

      success: true,

      asset,

    };

  } catch (err) {

    console.error(
      "UPLOAD MARKETING ASSET FLOW ERROR:",
      err
    );

    throw err;

  }

}