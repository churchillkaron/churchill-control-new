import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {

  try {

    const { data, error } = await supabase
      .from("campaign_memory")
      .select("*")
      .eq("status", "approved");

    if (error) {

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );

    }

    function best(key) {

      const map = {};

      data.forEach((item) => {

        const value = item[key];

        if (!value) return;

        map[value] = (map[value] || 0) + 1;

      });

      const sorted = Object.entries(map).sort(
        (a, b) => b[1] - a[1]
      );

      return sorted[0]?.[0] || null;

    }

    const recommendation = {

      recommendedMood:
        best("mood_preset"),

      recommendedTheme:
        best("event_theme"),

      recommendedCampaignType:
        best("campaign_type"),

      recommendedVisualStyle:
        best("visual_style"),

      recommendedComposition:
        best("composition_style"),

    };

    return NextResponse.json({
      success: true,
      recommendation,
    });

  } catch (err) {

    return NextResponse.json(
      {
        error:
          err.message || "Recommendation failed",
      },
      { status: 500 }
    );

  }

}