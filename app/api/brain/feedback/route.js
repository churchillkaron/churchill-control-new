import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req) {
  try {
    const body = await req.json();

    const { data, error } = await supabase
      .from("campaign_memory")
      .update({
        human_rating: body.rating,
        human_feedback: body.feedback,
        engagement_score: body.engagementScore || 0,
        approval_score: body.approvalScore || 0,
        ai_learning_tags: body.tags || "",
        status: body.status || "reviewed",
      })
      .eq("id", body.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      updated: data,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Feedback failed" },
      { status: 500 }
    );
  }
}