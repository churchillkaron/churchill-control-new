import { calculateCampaignScore }
from "@/lib/marketing/ai/scoring/calculateCampaignScore";

import { updateCampaignPerformance }
from "@/lib/supabase/updateCampaignPerformance";

import { updateAssetPerformance }
from "@/lib/marketing/ai/performance/updateAssetPerformance";

export async function processCampaignAnalytics({

  campaignId,

  analytics,

  selectedAssets = [],

}){

  const score =
    calculateCampaignScore(
      analytics
    );

  const reachMetric =
    analytics?.data?.find(
      (m) =>
        m.name === "reach"
    );

  const reachScore =
    reachMetric?.values?.[0]
      ?.value || 0;

  await updateCampaignPerformance({

    campaignId,

    engagementScore:
      score,

    reachScore,

    conversionScore: 0,

  });

  await updateAssetPerformance({

  assets:
    selectedAssets,

  campaignScore:
    score,

});

  return {

    success: true,

    score,

    reachScore,

  };

}