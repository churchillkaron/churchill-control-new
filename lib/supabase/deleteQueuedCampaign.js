import { supabase }
from "@/lib/supabase";

export async function deleteQueuedCampaign({

  queueId,

}) {

  try {

    const {
      error,
    } = await supabase

      .from(
        "campaign_publish_queue"
      )

      .delete()

      .eq(
        "id",
        queueId
      );

    if (error) {

      throw error;

    }

    return {

      success: true,

    };

  } catch (err) {

    console.error(
      "DELETE QUEUED CAMPAIGN ERROR:",
      err
    );

    return {

      success: false,

      error:
        err.message,

    };

  }

}