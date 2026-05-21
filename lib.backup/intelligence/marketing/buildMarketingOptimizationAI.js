import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function buildMarketingOptimizationAI({
  tenant_id,
}) {

  try {

    const {
      data: campaigns,
      error,
    } = await supabaseAdmin
      .from("marketing_campaigns")
      .select(`
        id,
        campaign_name,
        platform,
        impressions,
        clicks,
        engagement_score,
        status,
        created_at
      `)
      .eq(
        "tenant_id",
        tenant_id
      )
      .limit(1000);

    if (error) {
      throw error;
    }

    let totalImpressions = 0;

    let totalClicks = 0;

    const analysis = [];

    for (const campaign of campaigns || []) {

      const impressions =
        Number(
          campaign.impressions || 0
        );

      const clicks =
        Number(
          campaign.clicks || 0
        );

      totalImpressions +=
        impressions;

      totalClicks +=
        clicks;

      const ctr =
        impressions > 0
          ? (
              (clicks / impressions) *
              100
            ).toFixed(2)
          : 0;

      let performance =
        "GOOD";

      let recommendation =
        "Maintain current strategy.";

      if (
        Number(ctr) < 1
      ) {

        performance =
          "LOW";

        recommendation =
          "Improve campaign creatives and targeting.";
      }

      if (
        Number(
          campaign.engagement_score || 0
        ) < 50
      ) {

        performance =
          "CRITICAL";

        recommendation =
          "Rebuild campaign messaging and offer structure.";
      }

      analysis.push({

        campaign:
          campaign.campaign_name,

        platform:
          campaign.platform,

        impressions,

        clicks,

        ctr,

        engagement_score:
          campaign.engagement_score || 0,

        performance,

        recommendation,
      });
    }

    const averageCTR =
      totalImpressions > 0
        ? (
            (totalClicks /
              totalImpressions) *
            100
          ).toFixed(2)
        : 0;

    return {

      success: true,

      summary: {

        campaigns:
          analysis.length,

        impressions:
          totalImpressions,

        clicks:
          totalClicks,

        average_ctr:
          averageCTR,
      },

      analysis:
        analysis.sort(
          (a, b) =>
            Number(a.ctr) -
            Number(b.ctr)
        ),

      generated_at:
        new Date().toISOString(),
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
