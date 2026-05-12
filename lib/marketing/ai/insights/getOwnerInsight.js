import { supabase }
from "@/lib/supabase";

export async function getOwnerInsights({

  tenantId,

  pageId,

}) {

  try {

    const insights = [];

    // BUSINESS PROFILE

    const {
      data: profile,
    } = await supabase

      .from(
        "business_ai_profiles"
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

      .single();

    // CAMPAIGNS

    const {
      data: campaigns,
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
        "created_at",
        {
          ascending: false,
        }
      )

      .limit(50);

    // ASSETS

    const {
      data: assets,
    } = await supabase

      .from(
        "marketing_assets"
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

      .order(
        "score",
        {
          ascending: false,
        }
      )

      .limit(20);

    // PROFILE INSIGHTS

    if (profile?.top_campaign_type) {

      insights.push({

        type:
          "campaign",

        priority:
          "high",

        title:
          "Top campaign pattern detected",

        message:
          `${profile.top_campaign_type} campaigns are currently the strongest-performing campaign style for this business.`,

      });

    }

    if (
      profile?.best_post_day &&
      profile?.best_post_hour
    ) {

      insights.push({

        type:
          "schedule",

        priority:
          "high",

        title:
          "Best engagement window identified",

        message:
          `${profile.best_post_day} around ${profile.best_post_hour}:00 is currently the strongest posting window.`,

      });

    }

    if (profile?.top_lighting) {

      insights.push({

        type:
          "visual",

        priority:
          "medium",

        title:
          "Visual style dominance",

        message:
          `${profile.top_lighting} lighting is outperforming other visual styles.`,

      });

    }

    // TREND ANALYSIS

    if (campaigns?.length >= 5) {

      const recent =
        campaigns
          .slice(0, 5)
          .reduce(

            (sum, c) =>

              sum +
              (
                c.performance_score || 0
              ),

            0

          ) / 5;

      const older =
        campaigns
          .slice(5, 10)
          .reduce(

            (sum, c) =>

              sum +
              (
                c.performance_score || 0
              ),

            0

          ) / 5;

      if (recent > older) {

        insights.push({

          type:
            "growth",

          priority:
            "high",

          title:
            "Engagement trend improving",

          message:
            `Recent campaigns are outperforming older campaigns. AI optimization is improving business engagement.`,

        });

      }

      if (recent < older) {

        insights.push({

          type:
            "warning",

          priority:
            "high",

          title:
            "Campaign fatigue detected",

          message:
            `Recent campaigns are underperforming compared to previous campaigns. Consider refreshing campaign style or content direction.`,

        });

      }

    }

    // ASSET ANALYSIS

    if (assets?.[0]) {

      insights.push({

        type:
          "asset",

        priority:
          "medium",

        title:
          "Top visual asset identified",

        message:
          `${assets[0].name || "A visual asset"} is currently driving the strongest engagement performance.`,

      });

    }

    // LOW DATA WARNING

    if (
      campaigns?.length < 5
    ) {

      insights.push({

        type:
          "system",

        priority:
          "low",

        title:
          "More learning data needed",

        message:
          "The AI system needs more published campaigns to strengthen business intelligence accuracy.",

      });

    }

    return {

      success: true,

      insights,

    };

  } catch (err) {

    console.error(
      "GET OWNER INSIGHTS ERROR:",
      err
    );

    return {

      success: false,

      insights: [],

      error:
        err.message,

    };

  }

}