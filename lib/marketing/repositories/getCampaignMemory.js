import { getServiceSupabase }
from "@/lib/shared/supabase/service";

const supabase =
  getServiceSupabase();

export async function getCampaignMemory({

  organizationId,

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
        "organization_id",
        organizationId
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