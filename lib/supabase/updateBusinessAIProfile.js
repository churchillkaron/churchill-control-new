import { supabase }
from "@/lib/supabase";

export async function updateBusinessAIProfile({

  tenantId,

  pageId,

}) {

  try {

    // LOAD TOP CAMPAIGNS

    const {
      data: campaigns,
      error: campaignError,
    } = await supabase

      .from(
        "marketing_campaigns"
      )

      .select("*")

      .eq(
        "tenant_id",
        tenantId
      )

      .eq(
        "page_id",
        pageId
      )

      .not(
        "performance_score",
        "is",
        null
      )

      .order(
        "performance_score",
        {
          ascending: false,
        }
      )

      .limit(25);

    if (campaignError) {

      throw campaignError;

    }

    if (!campaigns?.length) {

      return null;

    }

    // TOP VALUES

    const moods = {};
    const lighting = {};
    const atmosphere = {};
    const campaignTypes = {};

    // TIME LEARNING

    const postingHours = {};
    const postingDays = {};

    for (const campaign of campaigns) {

      const score =
        campaign.performance_score || 0;

      // MOOD

      if (campaign.mood) {

        moods[campaign.mood] =

          (
            moods[campaign.mood] || 0
          ) + score;

      }

      // LIGHTING

      if (campaign.lighting) {

        lighting[campaign.lighting] =

          (
            lighting[campaign.lighting] || 0
          ) + score;

      }

      // ATMOSPHERE

      if (campaign.atmosphere) {

        atmosphere[
          campaign.atmosphere
        ] =

          (
            atmosphere[
              campaign.atmosphere
            ] || 0
          ) + score;

      }

      // CAMPAIGN TYPE

      if (campaign.campaign_type) {

        campaignTypes[
          campaign.campaign_type
        ] =

          (
            campaignTypes[
              campaign.campaign_type
            ] || 0
          ) + score;

      }

      // TIME PERFORMANCE LEARNING

      if (campaign.published_at) {

        const publishedDate =

          new Date(
            campaign.published_at
          );

        const hour =
          publishedDate.getHours();

        const day =

          publishedDate.toLocaleDateString(

            "en-US",

            {
              weekday: "long",
            }

          );

        postingHours[hour] =

          (
            postingHours[hour] || 0
          ) + score;

        postingDays[day] =

          (
            postingDays[day] || 0
          ) + score;

      }

    }

    // BEST VALUES

    const topMood =

      Object.entries(moods)

        .sort(
          (a, b) => b[1] - a[1]
        )[0]?.[0] || null;

    const topLighting =

      Object.entries(lighting)

        .sort(
          (a, b) => b[1] - a[1]
        )[0]?.[0] || null;

    const topAtmosphere =

      Object.entries(atmosphere)

        .sort(
          (a, b) => b[1] - a[1]
        )[0]?.[0] || null;

    const topCampaignType =

      Object.entries(campaignTypes)

        .sort(
          (a, b) => b[1] - a[1]
        )[0]?.[0] || null;

    // BEST POSTING TIME

    const bestPostHour =

      Object.entries(postingHours)

        .sort(
          (a, b) => b[1] - a[1]
        )[0]?.[0] || null;

    const bestPostDay =

      Object.entries(postingDays)

        .sort(
          (a, b) => b[1] - a[1]
        )[0]?.[0] || null;

    // UPSERT PROFILE

    const {

      data,

      error,

    } = await supabase

      .from(
        "business_ai_profiles"
      )

      .upsert({

        tenant_id:
          tenantId,

        page_id:
          pageId,

        top_mood:
          topMood,

        top_lighting:
          topLighting,

        top_atmosphere:
          topAtmosphere,

        top_campaign_type:
          topCampaignType,

        best_post_hour:
          bestPostHour,

        best_post_day:
          bestPostDay,

        total_campaigns:
          campaigns.length,

        updated_at:
          new Date()
            .toISOString(),

      })

      .select()

      .single();

    if (error) {

      throw error;

    }

    return data;

  } catch (err) {

    console.error(
      "UPDATE BUSINESS AI PROFILE ERROR:",
      err
    );

    throw err;

  }

}