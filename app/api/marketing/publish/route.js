import { NextResponse }
from "next/server";

import { createClient }
from "@supabase/supabase-js";

export const dynamic =
  "force-dynamic";

const supabase =
  createClient(

    process.env
      .NEXT_PUBLIC_SUPABASE_URL,

    process.env
      .SUPABASE_SERVICE_ROLE_KEY

  );

export async function POST(req) {

  try {

    const body =
      await req.json();

    const {
      campaignId,
    } = body;

    if (!campaignId) {

      return NextResponse.json(
        {
          error:
            "Missing campaignId",
        },
        {
          status: 400,
        }
      );

    }

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
        campaignId
      )

      .single();

    if (
      campaignError ||
      !campaign
    ) {

      return NextResponse.json(
        {
          error:
            "Campaign not found",
        },
        {
          status: 404,
        }
      );

    }

    // LOAD META ACCOUNT
    // USING PAGE ID

    const {
      data: metaAccount,
      error: metaError,
    } = await supabase

      .from(
        "meta_accounts"
      )

      .select("*")

      .eq(
        "page_id",
        campaign.page_id
      )

      .single();

    if (
      metaError ||
      !metaAccount
    ) {

      return NextResponse.json(
        {
          error:
            "Meta account not found",
        },
        {
          status: 404,
        }
      );

    }

    // CAPTION

    const caption = `

${campaign.title || ""}

${campaign.subtitle || ""}

${campaign.extra_direction || ""}

#ChurchillPhuket

`;

    // ====================================
    // FACEBOOK PAGE POST
    // ====================================

    let facebookResult = null;

    try {

      const facebookRes =
        await fetch(

          `https://graph.facebook.com/v23.0/${metaAccount.page_id}/photos`,

          {

            method: "POST",

            headers: {

              "Content-Type":
                "application/json",

            },

            body: JSON.stringify({

              url:
                campaign.image_url,

              caption,

              access_token:
                metaAccount.access_token,

            }),

          }

        );

      facebookResult =
        await facebookRes.json();

      console.log(
  "FACEBOOK STATUS:",
  facebookRes.status
);

console.log(
  "FACEBOOK RESULT:",
  facebookResult
);

if (
  facebookResult.error
) {

  console.error(
    "FACEBOOK ERROR:",
    facebookResult.error
  );

}

    } catch (err) {

      console.error(
        "FACEBOOK PUBLISH ERROR:",
        err
      );

    }

    // ====================================
    // INSTAGRAM POST
    // ====================================

    let instagramResult = null;

    try {

      if (
        metaAccount.instagram_business_id
      ) {

        // CREATE MEDIA CONTAINER

        const containerRes =
          await fetch(

            `https://graph.facebook.com/v23.0/${metaAccount.instagram_business_id}/media`,

            {

              method: "POST",

              headers: {

                "Content-Type":
                  "application/json",

              },

              body: JSON.stringify({

                image_url:
                  campaign.image_url,

                caption,

                access_token:
                  metaAccount.access_token,

              }),

            }

          );

        const containerData =
          await containerRes.json();

        console.log(
          "IG CONTAINER:",
          containerData
        );

        if (containerData.id) {

          // PUBLISH MEDIA

          const publishRes =
            await fetch(

              `https://graph.facebook.com/v23.0/${metaAccount.instagram_business_id}/media_publish`,

              {

                method: "POST",

                headers: {

                  "Content-Type":
                    "application/json",

                },

                body: JSON.stringify({

                  creation_id:
                    containerData.id,

                  access_token:
                    metaAccount.access_token,

                }),

              }

            );

          instagramResult =
            await publishRes.json();

          console.log(
            "INSTAGRAM PUBLISH:",
            instagramResult
          );

        }

      }

    } catch (err) {

      console.error(
        "INSTAGRAM PUBLISH ERROR:",
        err
      );

    }

    // UPDATE CAMPAIGN STATUS

    const {
      error: updateError,
    } = await supabase

      .from(
        "marketing_campaigns"
      )

      .update({

        status:
          "published",

        published_at:
          new Date()
            .toISOString(),

      })

      .eq(
        "id",
        campaignId
      );

    if (updateError) {

      return NextResponse.json(
        {
          error:
            updateError.message,
        },
        {
          status: 500,
        }
      );

    }

    // REMOVE FROM QUEUE

    await supabase

      .from(
        "campaign_publish_queue"
      )

      .delete()

      .eq(
        "campaign_id",
        campaignId
      );

    // SAVE LOG

    await supabase

      .from(
        "campaign_publish_logs"
      )

      .insert({

        tenant_id:
          campaign.tenant_id,

        campaign_id:
          campaign.id,

        provider:
          "meta",

        status:
          "success",

        response: {

          facebook:
            facebookResult,

          instagram:
            instagramResult,

        },

        created_at:
          new Date()
            .toISOString(),

      });

    return NextResponse.json({

      success: true,

      campaignId,

      facebook:
        facebookResult,

      instagram:
        instagramResult,

    });

  } catch (error) {

    console.error(
      "PUBLISH ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error.message,
      },
      {
        status: 500,
      }
    );

  }

}