import { NextResponse } from "next/server";

import { supabase } from "@/lib/shared/supabase/client";

export const dynamic = "force-dynamic";
export async function POST(req) {
  try {
    const body = await req.json();

    const { staff, department, score } = body;

    const { data, error } = await supabase
      .from("performance")
      .insert([
        {
          staff,
          department,
          score,
          date: new Date().toISOString(),
        },
      ]);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });

  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}