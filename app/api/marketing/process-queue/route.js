import { NextResponse } from "next/server";

import { supabase } from "@/lib/shared/supabase/client";

import { validateMetaToken } from "@/lib/marketing/distribution/meta/utils/validateMetaToken";
import { publishToFacebook } from "@/lib/marketing/distribution/meta/publishing/publishToFacebook";
import { publishToInstagram } from "@/lib/marketing/distribution/meta/publishing/publishToInstagram";

export const dynamic = "force-dynamic";

export async function POST() {

  try {

    console.log("PROCESS QUEUE START");

    const now =
      new Date().toISOString();

    const {

      data: jobs,

      error: jobsError,

    } = await supabase

      .from("campaign_publish_queue")

      .select("*")

      .eq(
        "status",
        "queued"
      )

      .lte(
        "scheduled_for",
        now
      )

      .lt(
        "retry_count",
        5
      )

      .limit(5);

    if (jobsError) {

      throw jobsError;

    }

    if (!jobs?.length) {

      return NextResponse.json({

        success: true,

        processed: 0,

        message:
          "No queued jobs",

      });

    }

    let processed = 0;

    for (const job of jobs) {

      try {

        console.log(
          "PROCESSING JOB:",
          job.id
        );

        // UPDATE QUEUE → PUBLISHING

        await supabase

          .from(
            "campaign_publish_queue"
          )

          .update({

            status:
              "publishing",

            started_publishing_at:
              new Date()
                .toISOString(),

          })

          .eq(
            "id",
            job.id
          );

        // LOAD CAMPAIGN

        const {

          data: campaign,

          error: campaignError,

        } = await supabase

          .from(
            "marketing_campaigns"
          )

          .select("*")

          .eq(
            "id",
            job.campaign_id
          )

          .single();

        if (
          campaignError ||
          !campaign
        ) {

          throw new Error(
            "Campaign not found"
          );

        }

        // LOAD META ACCOUNT

        const {

          data: account,

          error: accountError,

        } = await supabase

          .from(
            "meta_accounts"
          )

          .select("*")

          .eq(
            "connected",
            true
          )

          .eq(
            "page_id",
            campaign.page_id
          )

          .single();

        if (
          accountError ||
          !account
        ) {

          throw new Error(
            "No connected Meta account"
          );

        }

        // VALIDATE TOKEN

        const tokenValidation =

          await validateMetaToken({

            accessToken:
              account.access_token,

          });

        if (
          !tokenValidation.success
        ) {

          throw new Error(

            tokenValidation.error ||

            "Meta token invalid"

          );

        }

        // CAPTION

        const caption = `

${campaign.caption || ""}

${campaign.hashtags || ""}

`;

        // FACEBOOK

        let facebookResult =
          null;

        if (
          account.page_id &&
          campaign.image_url
        ) {

          facebookResult =

            await publishToFacebook({

              pageId:
                account.page_id,

              accessToken:
                account.access_token,

              imageUrl:
                campaign.image_url,

              caption,

            });

          console.log(
            "FACEBOOK RESULT:",
            facebookResult
          );

        }

        // INSTAGRAM

        let instagramResult =
          null;

        if (
          account.instagram_business_id &&
          campaign.image_url
        ) {

          instagramResult =

            await publishToInstagram({

              instagramBusinessId:
                account.instagram_business_id,

              accessToken:
                account.access_token,

              imageUrl:
                campaign.image_url,

              caption,

            });

          console.log(
            "INSTAGRAM RESULT:",
            instagramResult
          );

        }

        const facebookSuccess =

          !facebookResult ||
          facebookResult.success;

        const instagramSuccess =

          !instagramResult ||
          instagramResult.success;

        const publishSuccess =

          facebookSuccess &&
          instagramSuccess;

        // FAILURE

        if (!publishSuccess) {

          await supabase

            .from(
              "campaign_publish_queue"
            )

            .update({

              status:

                (job.retry_count || 0) >= 4

                  ? "permanently_failed"

                  : "failed",

              retry_count:

                (job.retry_count || 0) + 1,

              last_error:

                facebookResult?.error ||

                instagramResult?.error ||

                "Publish failed",

            })

            .eq(
              "id",
              job.id
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
              campaign.id
            );

          continue;

        }

        // SUCCESS

        await supabase

          .from(
            "campaign_publish_queue"
          )

          .update({

            status:
              "published",

            published_at:
              new Date()
                .toISOString(),

            facebook_post_id:
              facebookResult?.postId || null,

            instagram_post_id:
              instagramResult?.postId || null,

          })

          .eq(
            "id",
            job.id
          );

        // UPDATE CAMPAIGN

        await supabase

          .from(
            "marketing_campaigns"
          )

          .update({

            status:
              "published",

            facebook_post_id:
              facebookResult?.postId || null,

            instagram_post_id:
              instagramResult?.postId || null,

            published_at:
              new Date()
                .toISOString(),

          })

          .eq(
            "id",
            campaign.id
          );

        processed++;

      } catch (jobError) {

        console.error(
          "JOB FAILED:",
          job.id,
          jobError
        );

        await supabase

          .from(
            "campaign_publish_queue"
          )

          .update({

            status:

              (job.retry_count || 0) >= 4

                ? "permanently_failed"

                : "failed",

            retry_count:

              (job.retry_count || 0) + 1,

            last_error:

              jobError.message ||

              "Unknown publish error",

          })

          .eq(
            "id",
            job.id
          );

      }

    }

    return NextResponse.json({

      success: true,

      processed,

    });

  } catch (err) {

    console.error(
      "PROCESS QUEUE ERROR:",
      err
    );

    return NextResponse.json(

      {

        success: false,

        error:

          err.message ||

          "Queue processing failed",

      },

      {
        status: 500,
      }

    );

  }

}