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

    try {

      await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/intake/process`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            submissionId,
          }),
        }
      );

    } catch (processError) {

      console.error(
        "AUTO_PROCESS_ERROR",
        processError
      );

    }

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
