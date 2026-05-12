import { supabase }
from "@/lib/shared/supabase/client";

export async function queueCampaign({

  campaignId,

  tenantId,

  pageId,

  platform = "meta",

  scheduledFor = null,

}) {

  try {

    if (!campaignId) {

      return {

        success: false,

        error:
          "Missing campaignId",

      };

    }

    let finalSchedule =
      scheduledFor;

    // AI AUTO SCHEDULING

    if (!finalSchedule) {

      const {
        data: businessProfile,
      } = await supabase

        .from(
          "business_ai_profiles"
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

        .single();

      if (
        businessProfile?.best_post_hour
      ) {

        const now =
          new Date();

        const autoDate =
          new Date();

        autoDate.setHours(

          Number(
            businessProfile.best_post_hour
          ),

          0,
          0,
          0

        );

        // NEXT DAY IF TIME PASSED

        if (autoDate < now) {

          autoDate.setDate(
            autoDate.getDate() + 1
          );

        }

        finalSchedule =
          autoDate.toISOString();

      } else {

        // FALLBACK

        finalSchedule =

          new Date()
            .toISOString();

      }

    }

    const payload = {

      campaign_id:
        campaignId,

      tenant_id:
        tenantId || null,

      page_id:
        pageId || null,

      platform,

      status:
        "queued",

      retry_count:
        0,

      last_error:
        null,

      scheduled_for:
        finalSchedule,

      created_at:
        new Date()
          .toISOString(),

    };

    console.log(
      "QUEUE CAMPAIGN:",
      payload
    );

    // INSERT QUEUE ITEM

    const {
      data,
      error,
    } = await supabase

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

    const {
      error:
        campaignUpdateError,
    } = await supabase

      .from(
        "marketing_campaigns"
      )

      .update({

        status:
          "queued",

        scheduled_for:
          finalSchedule,

      })

      .eq(
        "id",
        campaignId
      );

    if (
      campaignUpdateError
    ) {

      console.error(

        "CAMPAIGN UPDATE ERROR:",

        campaignUpdateError

      );

    }

    return {

      success: true,

      data,

      scheduled_for:
        finalSchedule,

    };

  } catch (error) {

    console.error(

      "QUEUE CAMPAIGN CRASH:",

      error

    );

    return {

      success: false,

      error:
        error.message,

    };

  }

}