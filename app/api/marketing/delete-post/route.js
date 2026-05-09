
import { NextResponse } from "next/server";

import { supabase }
from "@/lib/supabase";

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

    // LOAD META ACCOUNT

    const {
      data: account,
      error: accountError,
    } = await supabase
      .from("meta_accounts")
      .select("*")
      .eq(
        "page_id",
        campaign.page_id
      )
      .single();

    if (
      accountError ||
      !account
    ) {

      return NextResponse.json(
        {
          success: false,
          error:
            "Meta account not found",
        },
        { status: 404 }
      );

    }

    const access_token =
      account.access_token;

    // DELETE FACEBOOK POST

    if (
      campaign.facebook_post_id
    ) {

      await fetch(
        `https://graph.facebook.com/v23.0/${campaign.facebook_post_id}?access_token=${access_token}`,
        {
          method: "DELETE",
        }
      );

    }

    // DELETE INSTAGRAM POST

    if (
      campaign.instagram_post_id
    ) {

      await fetch(
        `https://graph.facebook.com/v23.0/${campaign.instagram_post_id}?access_token=${access_token}`,
        {
          method: "DELETE",
        }
      );

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