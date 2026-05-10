import { NextResponse }
from "next/server";

import { createClient }
from "@supabase/supabase-js";

import { publishToMeta }
from "@/lib/meta/publishToMeta";

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

const {
  data: metaAccount,
} = await supabase

  .from(
    "meta_accounts"
  )

  .select("*")

  .eq(
    "tenant_id",
    campaign.tenant_id
  )

  .single();

// META PUBLISH

if (metaAccount) {

  const publishResult =
    await publishToMeta({

      imageUrl:
        campaign.image_url,

      caption:

        `${campaign.title}

${campaign.subtitle || ""}

#ChurchillPhuket`,

      accessToken:
        metaAccount.access_token,

      pageId:
        metaAccount.page_id,

    });

  if (!publishResult.success) {

    return NextResponse.json(
      {
        error:
          publishResult.error,
      },
      {
        status: 500,
      }
    );

  }

}

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
          "internal",

        status:
          "success",

        response: {

          message:
            "Published successfully",

        },

        created_at:
          new Date()
            .toISOString(),

      });

    return NextResponse.json({

      success: true,

      campaignId,

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