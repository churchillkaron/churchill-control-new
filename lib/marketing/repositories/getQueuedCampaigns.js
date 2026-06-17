import { supabase }
from "@/lib/shared/supabase/client";

export async function getQueuedCampaigns({
  tenantId,
}) {

  try {

    const {
      data,
      error,
    } = await supabase

      .from(
        "campaign_publish_queue"
      )

      .select(`
        *,
        marketing_campaigns (
          id,
          campaign_name,
          campaign_content
        )
      `)

      .eq(
        "tenant_id",
        tenantId
      )

      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    if (error) {
      throw error;
    }

    return (data || []).map(item => ({

      ...item,

      title:
        item.marketing_campaigns
          ?.campaign_content
          ?.title ||

        item.marketing_campaigns
          ?.campaign_name ||

        "Campaign",

      subtitle:
        item.marketing_campaigns
          ?.campaign_content
          ?.subtitle ||

        "Scheduled Campaign",

      image_url:
        item.marketing_campaigns
          ?.campaign_content
          ?.image_url ||

        null,

      thumbnail_url:
        item.marketing_campaigns
          ?.campaign_content
          ?.thumbnail_url ||

        item.marketing_campaigns
          ?.campaign_content
          ?.image_url ||

        null,

    }));

  } catch (err) {

    console.error(
      "GET QUEUED CAMPAIGNS ERROR:",
      err
    );

    return [];

  }

}
