import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {

    const { data, error } = await supabase
      .from("campaign_memory")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    const approved = data.filter(
      (c) => c.status === "approved"
    );

    const rejected = data.filter(
      (c) => c.status === "rejected"
    );

    function topValues(key) {

      const map = {};

      approved.forEach((item) => {

        const value = item[key];

        if (!value) return;

        map[value] = (map[value] || 0) + 1;

      });

      return Object.entries(map)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    }

    const intelligence = {
      totalCampaigns: data.length,

      approvedCampaigns: approved.length,

      rejectedCampaigns: rejected.length,

      bestMoods: topValues("mood_preset"),

      bestThemes: topValues("event_theme"),

      bestCampaignTypes: topValues("campaign_type"),

      bestVisualStyles: topValues("visual_style"),

      bestCompositions: topValues("composition_style"),
    };

    return NextResponse.json({
      success: true,
      intelligence,
    });

  } catch (err) {

    return NextResponse.json(
      {
        error:
          err.message || "Analysis failed",
      },
      { status: 500 }
    );

  }
}