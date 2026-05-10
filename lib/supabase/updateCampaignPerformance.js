import { supabase }
from "@/lib/supabase";

export async function updateCampaignPerformance({

  campaignId,

  engagementScore = 0,

  reachScore = 0,

  conversionScore = 0,

}) {

  const {
    data,
    error,
  } = await supabase
    .from(
      "marketing_campaigns"
    )
    .update({

      engagement_score:
        engagementScore,

      reach_score:
        reachScore,

      conversion_score:
        conversionScore,

    })
    .eq(
      "id",
      campaignId
    )
    .select()
    .single();

  if (error) {

    console.error(
      "UPDATE CAMPAIGN PERFORMANCE ERROR:",
      error
    );

    throw error;

  }

  return data;

}