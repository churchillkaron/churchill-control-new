import { NextResponse } from "next/server";

import { supabase } from "@/lib/shared/supabase/client";

import { validateMetaToken }
from "@/lib/marketing/distribution/meta/utils/validateMetaToken";

import { publishToFacebook }
from "@/lib/marketing/distribution/meta/publishing/publishToFacebook";

import { publishToInstagram }
from "@/lib/marketing/distribution/meta/publishing/publishToInstagram";

import { savePublishLog }
from "@/lib/marketing/repositories/savePublishLog";

export async function POST() {

  try {

    console.log(
      "PROCESS QUEUE START"
    );

    // LOAD QUEUED JOBS

    const {
      data: jobs,
      error: jobsError,
    } = await supabase
      .from(
        "campaign_publish_queue"
      )
      .select("*")
      .eq(
        "status",
        "queued"
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

        // UPDATE JOB STATUS

        await supabase
          .from(
            "campaign_publish_queue"
          )
          .update({
            status:
              "publishing",
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

          await savePublishLog({

            campaignId:
              campaign.id,

            queueId:
              job.id,

            tenantId:
              campaign.tenant_id,

            platform:
              "meta",

            status:
              "failed",

            errorMessage:
              tokenValidation.error,

            response:
              tokenValidation,

          });

          throw new Error(
            tokenValidation.error
          );

        }

        // BUILD CAPTION

        const caption = `
${campaign.caption || ""}

${campaign.hashtags || ""}
`;

        // FACEBOOK PUBLISH

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

          await savePublishLog({

            campaignId:
              campaign.id,

            queueId:
              job.id,

            tenantId:
              campaign.tenant_id,

            platform:
              "facebook",

            status:
              facebookResult.success
                ? "published"
                : "failed",

            postId:
              facebookResult.postId,

            response:
              facebookResult.response,

            errorMessage:
              facebookResult.error,

          });

        }

        // INSTAGRAM PUBLISH

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

          await savePublishLog({

            campaignId:
              campaign.id,

            queueId:
              job.id,

            tenantId:
              campaign.tenant_id,

            platform:
              "instagram",

            status:
              instagramResult.success
                ? "published"
                : "failed",

            postId:
              instagramResult.postId,

            response:
              instagramResult.response,

            errorMessage:
              instagramResult.error,

          });

        }

        // DETERMINE SUCCESS

        const facebookSuccess =
          !facebookResult ||
          facebookResult.success;

        const instagramSuccess =
          !instagramResult ||
          instagramResult.success;

        const publishSuccess =
          facebookSuccess &&
          instagramSuccess;

        // HANDLE FAILURE

        if (!publishSuccess) {

          await supabase
            .from(
              "campaign_publish_queue"
            )
            .update({
              status:
                "failed",
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

        // UPDATE SUCCESS

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
              facebookResult?.postId
              || null,

            instagram_post_id:
              instagramResult?.postId
              || null,

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
              "published",
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
              "failed",
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
        error:
          err.message ||
          "Queue processing failed",
      },
      { status: 500 }
    );
  }

}