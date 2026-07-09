import { createServerSupabase } from "@/lib/shared/supabase/server";

const supabase = createServerSupabase();

export async function getTopPerformingCampaigns({

  organizationId,

  pageId,

  limit = 5,

}) {

  let query =

    supabase

      .from(
        "marketing_campaigns"
      )

      .select("*")

      .eq(
        "organization_id",
        organizationId
      )

      .not(
        "analytics",
        "is",
        null
      )

      .order(
        "performance_score",
        {
          ascending: false,
          nullsFirst: false,
        }
      )

      .limit(limit);

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

    console.error(error);

    return [];

  }

  return data || [];

}