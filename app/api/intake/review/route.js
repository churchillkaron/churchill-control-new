import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/shared/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {

  try {

    const supabase =
      createServerSupabase();

    const body =
      await req.json();

    const {
      submissionId,
      managerModule,
      managerType,
      reviewedBy,
    } = body;

    const {
      data: existing,
      error: existingError,
    } = await supabase
      .from("ai_intake_submissions")
      .select("*")
      .eq("id", submissionId)
      .single();

    if (existingError)
      throw existingError;

    const aiCorrect =
      existing.ai_module === managerModule &&
      existing.ai_type === managerType;

    const {
      data,
      error,
    } = await supabase
      .from("ai_intake_submissions")
      .update({
        manager_final_module:
          managerModule,

        manager_final_type:
          managerType,

        ai_correct:
          aiCorrect,

        reviewed_by:
          reviewedBy,

        reviewed_at:
          new Date().toISOString(),

        status:
          "reviewed",
      })
      .eq("id", submissionId)
      .select()
      .single();

    if (error)
      throw error;

    return NextResponse.json({
      success: true,
      submission: data,
    });

  } catch (error) {

    console.error(
      "INTAKE REVIEW ERROR",
      error
    );

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
