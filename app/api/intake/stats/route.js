import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/shared/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {

    const supabase =
      createServerSupabase();

    const { data, error } =
      await supabase
        .from("ai_intake_submissions")
        .select(
          "ai_module, ai_correct"
        );

    if (error) throw error;

    const reviewed =
      (data || []).filter(
        x => x.ai_correct !== null
      );

    const correct =
      reviewed.filter(
        x => x.ai_correct === true
      ).length;

    const accuracy =
      reviewed.length
        ? (
            correct /
            reviewed.length
          ) * 100
        : 0;

    return NextResponse.json({
      success: true,
      totalUploads:
        (data || []).length,
      reviewed:
        reviewed.length,
      correct,
      accuracy:
        Number(
          accuracy.toFixed(2)
        ),
    });

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );

  }
}
