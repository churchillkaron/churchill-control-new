import { supabase }
from "@/lib/supabase";

export async function queueCampaign({

  campaignId,

  tenantId,

  platform = "meta",

  scheduledFor = null,

}) {

  try {

    if (!campaignId) {

      return {
        success: false,
        error: "Missing campaignId",
      };

    }

    const payload = {

      campaign_id:
        campaignId,

      tenant_id:
        tenantId || null,

      platform,

      status:
        "queued",

      retry_count:
        0,

      last_error:
        null,

      scheduled_for:
        scheduledFor ||
        new Date().toISOString(),

      created_at:
        new Date().toISOString(),
    };

    console.log(
      "QUEUE CAMPAIGN:",
      payload
    );

    const { data, error } =
      await supabase
        .from(
          "campaign_publish_queue"
        )
        .insert(payload)
        .select()
        .single();

    if (error) {

      console.error(
        "QUEUE CAMPAIGN ERROR:",
        error
      );

      return {
        success: false,
        error,
      };

    }

    // UPDATE CAMPAIGN STATUS

    await supabase
      .from(
        "marketing_campaigns"
      )
      .update({
        status:
          "queued",
      })
      .eq(
        "id",
        campaignId
      );

    return {
      success: true,
      data,
    };

  } catch (error) {

    console.error(
      "QUEUE CAMPAIGN CRASH:",
      error
    );

    return {
      success: false,
      error: error.message,
    };

  }

}