import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// =========================
// UPDATE ASSET (APPROVE / REJECT)
// =========================
export async function POST(req) {
  try {
    const body = await req.json();

    const { id, status, note, impact } = body;

    if (!id || !status) {
      return NextResponse.json(
        { success: false, error: "Missing id or status" },
        { status: 400 }
      );
    }

    const updateData = {
      status,
      approved_by: "manager",
      updated_at: new Date().toISOString(),
    };

    // Only add optional fields if they exist
    if (note !== undefined) updateData.note = note;
    if (impact !== undefined) updateData.impact = impact;

    const { data, error } = await supabase
      .from("assets")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("UPDATE ERROR:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      asset: data,
    });

  } catch (err) {
    console.error("SERVER ERROR:", err);

    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}