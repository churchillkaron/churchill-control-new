import { supabase }
from "@/lib/shared/supabase/client";

export async function getBusinessRecommendations({

  tenantId,

  pageId,

}) {

  try {

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
        "performance_score",
        {
          ascending: false,
        }
      )

      .limit(20);

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

      .limit(10);

    const recommendations = [];

    if (profile?.top_mood) {

      recommendations.push({
        type: "creative",
        priority: "high",
        title:
          "Use strongest mood more often",
        message:
          `${profile.top_mood} is currently the strongest-performing mood for this business.`,
      });

    }

    if (profile?.top_lighting) {

      recommendations.push({
        type: "visual",
        priority: "high",
        title:
          "Repeat winning lighting style",
        message:
          `${profile.top_lighting} lighting is performing best and should guide future campaign visuals.`,
      });

    }

    if (profile?.best_post_day) {

      recommendations.push({
        type: "schedule",
        priority: "medium",
        title:
          "Use best posting day",
        message:
          `${profile.best_post_day} is currently the best-performing posting day for this business.`,
      });

    }

    if (profile?.best_post_hour) {

      recommendations.push({
        type: "schedule",
        priority: "medium",
        title:
          "Use best posting hour",
        message:
          `Campaigns perform best around ${profile.best_post_hour}:00.`,
      });

    }

    if (campaigns?.[0]) {

      recommendations.push({
        type: "campaign",
        priority: "high",
        title:
          "Repeat top campaign pattern",
        message:
          `${campaigns[0].campaign_type || "This campaign type"} is currently leading with score ${campaigns[0].performance_score || 0}.`,
      });

    }

    if (assets?.[0]) {

      recommendations.push({
        type: "asset",
        priority: "medium",
        title:
          "Use top-performing asset",
        message:
          `${assets[0].name || "A selected asset"} is currently your strongest visual asset.`,
      });

    }

    if (!recommendations.length) {

      recommendations.push({
        type: "system",
        priority: "low",
        title:
          "More data needed",
        message:
          "Publish more campaigns so the AI can learn stronger business-specific recommendations.",
      });

    }

    return {

      success: true,

      profile,

      campaigns:
        campaigns || [],

      assets:
        assets || [],

      recommendations,

    };

  } catch (err) {

    console.error(
      "GET BUSINESS RECOMMENDATIONS ERROR:",
      err
    );

    return {

      success: false,

      error:
        err.message,

      recommendations: [],

    };

  }

}