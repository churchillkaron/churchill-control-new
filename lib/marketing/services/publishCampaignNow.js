import { supabase }
from "@/lib/shared/supabase/client";

export async function publishCampaignNow({

  campaignId,

}) {

  try {

    await supabase
      .from(
        "marketing_campaigns"
      )
      .update({

        status:
          "publishing",

      })
      .eq(
        "id",
        campaignId
      );

    const response =
      await fetch(

        "/api/marketing/publish",

        {

          method: "POST",

          headers: {

            "Content-Type":
              "application/json",

          },

          body: JSON.stringify({

            campaignId,

          }),

        }

      );

    const data =
      await response.json();

    if (!response.ok) {

      await supabase
        .from(
          "marketing_campaigns"
        )
        .update({

          status:
            "failed",

        })
        .eq(
          "id",
          campaignId
        );

      throw new Error(

        data?.error ||
        "Publish failed"

      );

    }

    await supabase
      .from(
        "marketing_campaigns"
      )
      .update({

        status:
          "published",

      })
      .eq(
        "id",
        campaignId
      );

    return {

      success: true,

      data,

    };

  } catch (err) {

    console.error(
      "PUBLISH CAMPAIGN ERROR:",
      err
    );

    await supabase
      .from(
        "marketing_campaigns"
      )
      .update({

        status:
          "failed",

      })
      .eq(
        "id",
        campaignId
      );

    return {

      success: false,

      error:
        err.message,

    };

  }

}