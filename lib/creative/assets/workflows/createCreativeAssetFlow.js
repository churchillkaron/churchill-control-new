import { uploadCampaignImage }
from "@/lib/marketing/repositories/uploadCampaignImage";

import { analyzeCreativeAsset }
from "@/lib/creative/assets/intelligence/analyzeCreativeAsset";

import { saveCreativeAsset }
from "@/lib/creative/assets/repositories/saveCreativeAsset";

import { extractFaceIdentity }
from "@/lib/marketing/ai/identity/extractFaceIdentity";

import { calculateAssetScore }
from "@/lib/ai/scoring/calculateAssetScore";

import { getOrCreateBusinessProfile }
from "@/lib/ai/profiles/getOrCreateBusinessProfile";

export async function createCreativeAssetFlow({

  organizationId,

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

        organizationId,

      });

    // =====================================
    // BUSINESS PROFILE
    // =====================================

    const businessProfile =
      await getOrCreateBusinessProfile({
        organizationId,
      });

    // =====================================
    // AI ANALYSIS
    // =====================================

    const analysis =
      await analyzeCreativeAsset({

        fileUrl:
          uploadedImageUrl,

        assetType,

        businessProfile,

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
      await saveCreativeAsset({

        organizationId,

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
      "UPLOAD CREATIVE ASSET FLOW ERROR:",
      err
    );

    throw err;

  }

}