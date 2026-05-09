import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req) {
  try {
    const body = await req.json();
console.log(
  "CAMPAIGN MEMORY BODY:",
  body
);
    const { data, error } = await supabase
      .from("campaign_memory")
      .insert([
        {
          tenant_id: body.tenant_id || null,
          campaign_title: body.campaignTitle,
          campaign_type: body.campaignType,
          output_type: body.outputType,
          event_theme: body.eventTheme,
          mood_preset: body.moodPreset,
          composition_style: body.compositionStyle,
          visual_style: body.visualStyle,
          image_url: body.final_poster_url || null,
          final_poster_url: body.final_poster_url || null,
          prompt: body.prompt,
          caption: body.caption,
          hashtags: body.hashtags,
          cta: body.cta,
          status: "generated",
        },
      ])
      .select()
      .single();

    if (error) {

  console.error("SUPABASE ERROR:", error);

  return NextResponse.json(
    {
      error: error.message,
      details: error,
    },
    { status: 500 }
  );


    }

    return NextResponse.json({ success: true, memory: data });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Failed to save campaign memory" },
      { status: 500 }
    );
  }
}