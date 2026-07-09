import { getMarketingAssets }
from "@/lib/marketing/repositories/getMarketingAssets";

import { getTopPerformingAssets }
from "@/lib/marketing/ai/assets/getTopPerformingAssets";

import { selectRelevantAssets }
from "@/lib/marketing/ai/assets/selectRelevantAssets";

export async function buildAssetIntelligence({

  organizationId,

  poster,

}) {

  // ALL ASSETS

  const interiorAssets =
    await getMarketingAssets({

      organizationId,

      assetType:
        "interior",

    });

  const staffAssets =
    await getMarketingAssets({

      organizationId,

      assetType:
        "staff",

    });

  // TOP ASSETS

  const topAssets =
    await getTopPerformingAssets({

      organizationId,

      limit: 10,

    });

  // SELECT RELEVANT

  const selectedInteriorAssets =
    selectRelevantAssets({

      assets:
        interiorAssets,

      campaignType:
        poster.campaignType,

      mood:
        poster.mood,

      atmosphere:
        poster.atmosphere,

    });

  const selectedStaffAssets =
    selectRelevantAssets({

      assets:
        staffAssets,

      campaignType:
        poster.campaignType,

      mood:
        poster.mood,

      atmosphere:
        poster.atmosphere,

    });

  return {

    interiorAssets,

    staffAssets,

    topAssets,

    selectedInteriorAssets,

    selectedStaffAssets,

  };

}