import { getServiceSupabase }
from "@/lib/shared/supabase/service";

const supabase =
  getServiceSupabase();

export async function getQueuedCampaigns({
  organizationId,
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
      "organization_id",
      organizationId
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