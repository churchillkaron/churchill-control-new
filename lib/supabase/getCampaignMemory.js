import { supabase }
from "@/lib/supabase";

export async function getCampaignMemory({

  tenantId,

  campaignType,

  pageId,

}) {

  let query =

    supabase

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

  // BUSINESS MEMORY ISOLATION

  if (pageId) {

    query =
      query.eq(
        "page_id",
        pageId
      );

  }

  const {
    data,
    error,
  } = await query;

  if (error) {

    throw error;

  }

  return data || [];

}