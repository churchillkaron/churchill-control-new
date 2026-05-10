import { supabase }
from "@/lib/supabase";

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
        marketing_campaigns(*)

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

    return data || [];

  } catch (err) {

    console.error(
      "GET QUEUED CAMPAIGNS ERROR:",
      err
    );

    return [];

  }

}