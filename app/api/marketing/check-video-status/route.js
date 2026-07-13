export const dynamic = "force-dynamic";

import { supabase }
from "@/lib/shared/supabase/client";

export async function POST(
  request
) {

  try {

    const body =
      await request.json();

    if (process.env.NODE_ENV !== "production") console.log(
      "CHECK STATUS FULL BODY:",
      body
    );

    const {
      campaignId,
      videoJobId,
    } = body;

    if (process.env.NODE_ENV !== "production") console.log(
      "INCOMING campaignId:",
      campaignId
    );

    if (process.env.NODE_ENV !== "production") console.log(
      "INCOMING videoJobId:",
      videoJobId
    );

    // =====================================
    // GET RUNWAY STATUS
    // =====================================

    const result =
      await getRunwayTaskStatus(
        videoJobId
      );

    if (process.env.NODE_ENV !== "production") console.log(
      "RUNWAY STATUS CHECK:",
      result
    );

    // =====================================
    // COMPLETED
    // =====================================

    if (
      result?.status === "SUCCEEDED"
    ) {

      const videoUrl =
        result?.output?.[0] || null;

      if (process.env.NODE_ENV !== "production") console.log(
        "FINAL VIDEO URL:",
        videoUrl
      );

      // =====================================
      // FIND ASSET BY ID OR VIDEO JOB
      // =====================================

      let asset = null;
      let assetError = null;

      const assetById =
        await supabase

          .from("creative_assets")

          .select("*")

          .eq(
            "id",
            campaignId
          )

          .maybeSingle();

      asset =
        assetById.data;

      assetError =
        assetById.error;

      if (process.env.NODE_ENV !== "production") console.log(
        "ASSET BY ID:",
        asset
      );

      if (process.env.NODE_ENV !== "production") console.log(
        "ASSET BY ID ERROR:",
        assetError
      );

      // fallback: find generated campaign asset by campaign_id

      if (
        !asset &&
        campaignId
      ) {

        const assetByCampaignId =
          await supabase

            .from("creative_assets")

            .select("*")

            .eq(
              "campaign_id",
              campaignId
            )

            .order(
              "created_at",
              {
                ascending:
                  false,
              }
            )

            .limit(1)

            .maybeSingle();

        asset =
          assetByCampaignId.data;

        assetError =
          assetByCampaignId.error;

        if (process.env.NODE_ENV !== "production") console.log(
          "ASSET BY CAMPAIGN ID:",
          asset
        );

        if (process.env.NODE_ENV !== "production") console.log(
          "ASSET BY CAMPAIGN ID ERROR:",
          assetError
        );

      }

      // =====================================
      // RESOLVE REAL CAMPAIGN ID
      // =====================================

      const realCampaignId =

        asset?.campaign_id ||

        campaignId ||

        null;

      if (process.env.NODE_ENV !== "production") console.log(
        "REAL CAMPAIGN ID:",
        realCampaignId
      );

      if (
        !realCampaignId
      ) {

        throw new Error(
          "No real campaign id found"
        );

      }

      // =====================================
      // UPDATE MARKETING CAMPAIGN
      // =====================================

      const {
        data: campaignData,
        error: campaignError,
      } =
        await supabase

          .from("marketing_campaigns")

          .update({

            video_url:
              videoUrl,

            thumbnail_url:
              videoUrl,

            status:
              "completed",

            is_video:
              true,

            updated_at:
              new Date()
                .toISOString(),

          })

          .eq(
            "id",
            realCampaignId
          )

          .select()

          .maybeSingle();

      if (process.env.NODE_ENV !== "production") console.log(
        "VIDEO SAVE DATA:",
        campaignData
      );

      if (process.env.NODE_ENV !== "production") console.log(
        "VIDEO SAVE ERROR:",
        campaignError
      );

      if (
        campaignError
      ) {

        throw campaignError;

      }

      // =====================================
      // UPDATE MARKETING ASSET TOO
      // =====================================

      if (
        asset?.id
      ) {

        const {
          data: assetUpdateData,
          error: assetUpdateError,
        } =
          await supabase

            .from("creative_assets")

            .update({

              file_url:
                videoUrl,

              image_url:
                videoUrl,

              thumbnail_url:
                videoUrl,

              updated_at:
                new Date()
                  .toISOString(),

            })

            .eq(
              "id",
              asset.id
            )

            .select()

            .maybeSingle();

        if (process.env.NODE_ENV !== "production") console.log(
          "ASSET VIDEO SAVE DATA:",
          assetUpdateData
        );

        if (process.env.NODE_ENV !== "production") console.log(
          "ASSET VIDEO SAVE ERROR:",
          assetUpdateError
        );

      }

      return Response.json({

        success: true,

        completed: true,

        videoUrl,

        campaign:
          campaignData,

        asset,

      });

    }

    // =====================================
    // FAILED
    // =====================================

    if (
      result?.status === "FAILED"
    ) {

      await supabase

        .from("marketing_campaigns")

        .update({

          status:
            "failed",

          updated_at:
            new Date()
              .toISOString(),

        })

        .eq(
          "video_job_id",
          videoJobId
        );

      return Response.json({

        success: false,

        failed: true,

        failure:
          result?.failure,

        failureCode:
          result?.failureCode,

      });

    }

    // =====================================
    // PROCESSING
    // =====================================

    return Response.json({

      success: true,

      processing: true,

      runwayStatus:
        result?.status,

      progress:
        result?.progress || 0,

    });

  } catch (err) {

    console.error(
      "CHECK VIDEO STATUS ERROR:",
      err
    );

    return Response.json({

      success: false,

      error:
        err.message,

    });

  }

}