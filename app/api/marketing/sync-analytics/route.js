import { NextResponse } from "next/server";

import { supabase }
from "@/lib/supabase";

import { calculateCampaignScore }
from "@/lib/ai/calculateCampaignScore";

export async function GET() {

  try {

    const performanceScore =
  calculateCampaignScore(
    igData
  );

    const {
      data: campaigns,
      error: campaignsError,
    } = await supabase
      .from("marketing_campaigns")
      .select("*")
      .eq("status", "published");

    if (campaignsError) {

      throw campaignsError;

    }

    for (const campaign of campaigns) {

      try {

        const {
          data: account,
        } = await supabase
          .from("meta_accounts")
          .select("*")
          .eq(
            "page_id",
            campaign.page_id
          )
          .single();

        if (!account) {

          continue;

        }

        // INSTAGRAM ANALYTICS

        if (
          campaign.instagram_post_id
        ) {

          const igRes =
            await fetch(
              `https://graph.facebook.com/v23.0/${campaign.instagram_post_id}/insights?metric=likes,comments,shares,reach,impressions,saved&access_token=${account.access_token}`
            );

          const igData =
            await igRes.json();

          console.log(
            "IG ANALYTICS:",
            igData
          );

        await supabase
  .from(
    "marketing_campaigns"
  )
  .update({

    analytics:
      igData,

    performance_score:
      performanceScore,

    analytics_updated_at:
      new Date()
        .toISOString(),

  })
            .eq(
              "id",
              campaign.id
            );

        }

      } catch (campaignError) {

        console.error(
          "ANALYTICS ERROR:",
          campaignError
        );

      }

    }

    return NextResponse.json({
      success: true,
    });

  } catch (err) {

    console.error(
      "SYNC ANALYTICS ERROR:",
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