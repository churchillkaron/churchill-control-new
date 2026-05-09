import { NextResponse } from "next/server";

import { supabase }
from "@/lib/supabase";

export const dynamic =
  "force-dynamic";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const {
      campaignId,
      platforms,
    } = body;

    if (!campaignId) {

      return NextResponse.json(
        {
          error:
            "Missing campaignId",
        },
        { status: 400 }
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
      .eq("id", campaignId)
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
        { status: 404 }
      );

    }

    // CREATE QUEUE ITEM

    const {
      data: queueItem,
      error: queueError,
    } = await supabase
      .from(
        "campaign_publish_queue"
      )
      .insert([
        {
          tenant_id:
            campaign.tenant_id,

          campaign_id:
            campaign.id,

          status:
            "queued",

          platforms,

          scheduled_for:
            new Date()
              .toISOString(),
        },
      ])
      .select()
      .single();

    if (queueError) {

      console.error(
        "QUEUE ERROR:",
        queueError
      );

      return NextResponse.json(
        {
          error:
            queueError.message,
        },
        { status: 500 }
      );

    }

    // UPDATE CAMPAIGN STATUS

    await supabase
      .from(
        "marketing_campaigns"
      )
      .update({
        status: "queued",
      })
      .eq(
        "id",
        campaign.id
      );

    return NextResponse.json({

      success: true,

      queueItem,

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
      { status: 500 }
    );

  }

}