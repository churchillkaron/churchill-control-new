export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabase } from "@/lib/shared/supabase/client";

import {
  ChannelConnectionRuntime,
} from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";

import {
  ChannelAssetRuntime,
} from "@/lib/platform/channels/runtime/ChannelAssetRuntime";

import {
  resolveChannelCredential,
} from "@/lib/platform/channels/helpers/resolveChannelCredential";

import {
  MetaProvider,
} from "@/lib/platform/service-runtime/providers/meta/MetaProvider";

export async function POST(req) {

  try {

    if (process.env.NODE_ENV !== "production") console.log("META PUBLISH START");

    const body = await req.json();

    if (process.env.NODE_ENV !== "production") console.log("REQUEST BODY:", body);

    const queueId = body.queueId;

    if (!queueId) {

      return NextResponse.json(
        { error: "Missing queueId" },
        { status: 400 }
      );
    }

    // LOAD QUEUE ITEM

    const { data: queue, error: queueError } = await supabase
      .from("campaign_publish_queue")
      .select("*")
      .eq("id", queueId)
      .single();

    if (process.env.NODE_ENV !== "production") console.log("QUEUE:", queue);

    if (queueError || !queue) {

      if (process.env.NODE_ENV !== "production") console.log("QUEUE ERROR:", queueError);

      return NextResponse.json(
        { error: "Queue item not found" },
        { status: 404 }
      );
    }

    // LOAD CAMPAIGN

    const { data: campaign, error: campaignError } = await supabase
      .from("campaign_memory")
      .select("*")
      .eq("id", queue.campaign_memory_id)
      .single();

    if (process.env.NODE_ENV !== "production") console.log("CAMPAIGN:", campaign);

    if (campaignError || !campaign) {

      if (process.env.NODE_ENV !== "production") console.log("CAMPAIGN ERROR:", campaignError);

      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // LOAD META PROVIDER CONNECTION

    const connection =
      await ChannelConnectionRuntime.get({

        organization_id:
          campaign.organization_id,

        provider:
          "meta",

      });


    if (!connection) {

      return NextResponse.json(
        {
          error:
            "No connected Meta provider",
        },
        {
          status:404,
        }
      );

    }


    const asset =
      await ChannelAssetRuntime.find({

        organization_id:
          campaign.organization_id,

        provider:
          "meta",

        asset_type:
          "facebook_page",

        external_id:
          connection.metadata?.page_id,

      });


    const access_token =
      await resolveChannelCredential(
        connection
      );


    if (!access_token) {

      return NextResponse.json(
        {
          error:
            "Meta credential missing",
        },
        {
          status:404,
        }
      );

    }

    // VALIDATE IMAGE URL

    if (process.env.NODE_ENV !== "production") console.log("IMAGE URL:", campaign.image_url);

    if (
      !campaign.image_url ||
      campaign.image_url.includes("localhost")
    ) {

      return NextResponse.json(
        {
          error: "Invalid image URL",
          image_url: campaign.image_url,
        },
        { status: 400 }
      );
    }

    // BUILD MESSAGE

    const message = `
${campaign.caption || ""}

${campaign.hashtags || ""}
`;

    if (process.env.NODE_ENV !== "production") console.log("MESSAGE:", message);

    // FACEBOOK PUBLISH THROUGH SERVICE PROVIDER

    const publishData =
      await MetaProvider.execute({

        capability:
          "marketing.facebook.publish",

        organization_id:
          campaign.organization_id,

        page_id:
          connection.metadata?.page_id,

        access_token:
          access_token,

        message,

        image_url:
          campaign.image_url,

      });


    if (process.env.NODE_ENV !== "production") console.log(
      "FACEBOOK RESPONSE:",
      publishData
    );

    // FACEBOOK ERROR

    if (!publishData?.id) {

      return NextResponse.json(
        {
          error: "Facebook publish failed",
          details: publishData,
        },
        { status: 500 }
      );
    }

    // UPDATE QUEUE

    const { error: queueUpdateError } = await supabase
      .from("campaign_publish_queue")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        post_id: publishData.id,
      })
      .eq("id", queueId);

    if (process.env.NODE_ENV !== "production") console.log(
      "QUEUE UPDATE ERROR:",
      queueUpdateError
    );

    // UPDATE CAMPAIGN

    const { error: campaignUpdateError } = await supabase
      .from("campaign_memory")
      .update({
        status: "published",
      })
      .eq("id", campaign.id);

    if (process.env.NODE_ENV !== "production") console.log(
      "CAMPAIGN UPDATE ERROR:",
      campaignUpdateError
    );

    return NextResponse.json({
      success: true,
      facebook_post_id: publishData.id,
      facebook_response: publishData,
    });

  } catch (err) {

    if (process.env.NODE_ENV !== "production") console.log("META PUBLISH CRASH:", err);

    return NextResponse.json(
      {
        error: err.message || "Meta publish failed",
      },
      { status: 500 }
    );
  }
}