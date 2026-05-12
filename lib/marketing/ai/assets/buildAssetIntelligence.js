import { getMarketingAssets }
from "@/lib/supabase/getMarketingAssets";

import { getTopPerformingAssets }
from "@/lib/marketing/ai/assets/getTopPerformingAssets";

import { selectRelevantAssets }
from "@/lib/marketing/ai/assets/selectRelevantAssets";

export async function buildAssetIntelligence({

  tenantId,

  poster,

}) {

  // ALL ASSETS

  const interiorAssets =
    await getMarketingAssets({

      tenantId,

      assetType:
        "interior",

    });

  const staffAssets =
    await getMarketingAssets({

      tenantId,

      assetType:
        "staff",

    });

  // TOP ASSETS

  const topAssets =
    await getTopPerformingAssets({

      tenantId,

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