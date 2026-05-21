import { supabase }
from "@/lib/shared/supabase/client";

export async function getQueuedCampaigns({
  tenantId,
  pageId,
}) {

  const {
    data,
    error,
  } = await supabase

    .from(
      "campaign_publish_queue"
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

    .limit(100);

  if (error) {
    throw error;
  }

  return {
    queue:
      data || [],
  };

}