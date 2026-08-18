import { NextResponse } from "next/server";

import { createServerSupabase } from "@/lib/shared/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const supabase = createServerSupabase();
    const { searchParams } = new URL(req.url);
    const moduleFilter = searchParams.get("module");

    let query = supabase
      .from("ai_intake_submissions")
      .select("*")
      .order("created_at", { ascending: false });

    if (moduleFilter && moduleFilter !== "ALL") {
      query = query.eq("ai_module", moduleFilter);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({
      success: true,
      submissions: data || [],
    });
  } catch (error) {
    console.error("INTAKE_LIST_ERROR", {
      message: error?.message || "Unable to list intake submissions",
    });

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to list intake submissions",
      },
      { status: 500 },
    );
  }
}
