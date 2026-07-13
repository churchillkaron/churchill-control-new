export const dynamic = "force-dynamic";


import { NextResponse } from "next/server";

import { supabase }
from "@/lib/shared/supabase/client";

import {
  ChannelConnectionRuntime,
} from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";

import {
  resolveChannelCredential,
} from "@/lib/platform/channels/helpers/resolveChannelCredential";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const {
      campaignId,
    } = body;

    // LOAD CAMPAIGN

    const {
      data: campaign,
      error: campaignError,
    } = await supabase
      .from("marketing_campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();

    if (
      campaignError ||
      !campaign
    ) {

      return NextResponse.json(
        {
          success: false,
          error:
            "Campaign not found",
        },
        { status: 404 }
      );

    }

    // LOAD META PROVIDER CONNECTION

    const connection =
      await ChannelConnectionRuntime.get({

        organization_id:
          campaign.organization_id,

        provider_id:
          "meta",

      });


    if (!connection) {

      return NextResponse.json(
        {
          success:false,

          error:
            "Meta provider connection not found",
        },
        {
          status:404,
        }
      );

    }


    const access_token =
      await resolveChannelCredential(
        connection
      );

    // DELETE FACEBOOK POST

    if (
      campaign.facebook_post_id
    ) {

      await MetaProvider.execute({

        capability:
          "marketing.social.delete",

        page_id:
          campaign.facebook_post_id,

        access_token,

      });

    }


    // DELETE INSTAGRAM POST

    if (
      campaign.instagram_post_id
    ) {

      await MetaProvider.execute({

        capability:
          "marketing.social.delete",

        page_id:
          campaign.instagram_post_id,

        access_token,

      });

    }

    // UPDATE STATUS

    await supabase
      .from("marketing_campaigns")
      .update({
        status: "deleted",
      })
      .eq("id", campaign.id);

    return NextResponse.json({
      success: true,
    });

  } catch (err) {

    console.error(
      "DELETE POST ERROR:",
      err
    );

    return NextResponse.json(
      {
        success: false,
        error:
          err.message,
      },
      { status: 500 }
    );

  }

}