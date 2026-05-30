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
      approvedBy,
    } = body;

    const {
      data,
      error,
    } = await supabase
      .from("ai_intake_submissions")
      .update({
        status: "approved",
        reviewed_by: approvedBy,
        reviewed_at:
          new Date().toISOString(),
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
      "INTAKE APPROVE ERROR",
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
