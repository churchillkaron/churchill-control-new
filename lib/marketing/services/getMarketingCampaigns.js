import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function getMarketingCampaigns({
  organizationId,
  pageId = null,
}) {

  let query =
    supabaseAdmin
      .from("marketing_campaigns")
      .select("*")
      .eq(
        "organization_id",
        organizationId,
      )
      .order(
        "created_at",
        {
          ascending: false,
        },
      )
      .limit(50);

  if (pageId) {

    query =
      query.eq(
        "page_id",
        pageId,
      );

  }

  const {
    data,
    error,
  } = await query;

  if (error) {
    throw error;
  }

  return {
    campaigns:
      data || [],
  };

}
