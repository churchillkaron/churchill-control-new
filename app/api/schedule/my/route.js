import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function GET(req) {
  try {
    const { searchParams } =
      new URL(req.url);

    const staffId =
      searchParams.get("staff_id");

    if (!staffId) {
      return NextResponse.json(
        {
          error: "Missing staff_id",
        },
        { status: 400 }
      );
    }

    const { data, error } =
      await supabase
        .from("staff_schedules")
        .select("*")
        .eq("staff_id", staffId)
        .order("shift_date", {
          ascending: true,
        });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      schedules: data || [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error.message,
      },
      { status: 500 }
    );
  }
}
