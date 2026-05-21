import { supabase }
from "@/lib/shared/supabase/client";

export async function getMarketingCampaigns({
  tenantId,
  pageId,
}) {

  const {
    data,
    error,
  } = await supabase

    .from(
      "marketing_campaigns"
    )

    .select("*")

    .eq(
      "tenant_id",
      tenantId
    )

    .eq(
      "page_id",
      pageId
    )

    .order(
      "created_at",
      {
        ascending: false,
      }
    )

    .limit(50);

  if (error) {
    throw error;
  }

  return {

    campaigns:
      data || [],

  };

}