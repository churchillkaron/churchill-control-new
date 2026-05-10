import { uploadCampaignImage }
from "@/lib/supabase/uploadCampaignImage";

import { analyzeMarketingAsset }
from "@/lib/ai/analyzeMarketingAsset";

import { saveMarketingAsset }
from "@/lib/supabase/saveMarketingAsset";

import { extractFaceIdentity }
from "@/lib/ai/extractFaceIdentity";

import { calculateAssetScore }
from "@/lib/ai/calculateAssetScore";

export async function uploadMarketingAssetFlow({

  tenantId,

  pageId,

  file,

  assetType,

  name,

}) {

  try {

    const uploadedImageUrl =
      await uploadCampaignImage({

        file,

        tenantId,

      });

    const analysis =
      await analyzeMarketingAsset({

        fileUrl:
          uploadedImageUrl,

        assetType,

      });

    let identityData = null;

    if (
      assetType === "staff"
    ) {

      identityData =
        await extractFaceIdentity({

          imageUrl:
            uploadedImageUrl,

        });

    }
const score =
  calculateAssetScore({

    analysis: {
      ...analysis,
      identity:
        identityData,
    },

  });
    const asset =
      await saveMarketingAsset({

        tenantId,

        pageId,

        assetType,

        name,

        imageUrl:
          uploadedImageUrl,

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