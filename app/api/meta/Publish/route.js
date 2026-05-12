import { NextResponse } from "next/server";
import { supabase } from "@/lib/shared/supabase/client";

export async function POST(req) {

  try {

    console.log("META PUBLISH START");

    const body = await req.json();

    console.log("REQUEST BODY:", body);

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

    console.log("QUEUE:", queue);

    if (queueError || !queue) {

      console.log("QUEUE ERROR:", queueError);

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

    console.log("CAMPAIGN:", campaign);

    if (campaignError || !campaign) {

      console.log("CAMPAIGN ERROR:", campaignError);

      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // LOAD META ACCOUNT

    const { data: account, error: accountError } = await supabase
      .from("meta_accounts")
      .select("*")
      .eq("connected", true)
      .single();

    console.log("META ACCOUNT:", account);

    if (accountError || !account) {

      console.log("META ACCOUNT ERROR:", accountError);

      return NextResponse.json(
        { error: "No connected Meta account" },
        { status: 404 }
      );
    }

    // VALIDATE IMAGE URL

    console.log("IMAGE URL:", campaign.image_url);

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

    console.log("MESSAGE:", message);

    // FACEBOOK PUBLISH

    const publishPayload = {
      url: campaign.image_url,
      caption: message,
      access_token: account.access_token,
    };

    console.log(
      "FACEBOOK PAYLOAD:",
      publishPayload
    );

    const publishRes = await fetch(
      `https://graph.facebook.com/v23.0/${account.page_id}/photos`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(publishPayload),
      }
    );

    const publishData = await publishRes.json();

    console.log(
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

    console.log(
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

    console.log(
      "CAMPAIGN UPDATE ERROR:",
      campaignUpdateError
    );

    return NextResponse.json({
      success: true,
      facebook_post_id: publishData.id,
      facebook_response: publishData,
    });

  } catch (err) {

    console.log("META PUBLISH CRASH:", err);

    return NextResponse.json(
      {
        error: err.message || "Meta publish failed",
      },
      { status: 500 }
    );
  }
}