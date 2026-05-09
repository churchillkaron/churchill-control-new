import { supabase }
from "@/lib/supabase";

export async function getCampaignMemory({
  tenantId,
  campaignType,
}) {

  const { data, error } =
    await supabase
      .from(
        "campaign_memory"
      )
      .select("*")
      .eq(
        "tenant_id",
        tenantId
      )
      .eq(
        "campaign_type",
        campaignType
      )
     .order(
  "engagement_score",
  {
    ascending: false,
  }
)
      .limit(5);

  if (error) {

    throw error;
  }

  return data || [];
}