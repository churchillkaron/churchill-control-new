import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/shared/supabase/server";

export async function POST(req) {
  try {
    const body = await req.json();

    const {
      organization_id,
      table_id,
      seat_from,
      seat_to,
      target_table_id
    } = body;

    if (!organization_id || !table_id) {
      return NextResponse.json(
        { success: false, error: "Missing organization_id or table_id" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabase();

    // 1. Update seat assignment (move seat within same table or between tables)
    const { error } = await supabase
      .from("order_items")
      .update({
        seat_position: seat_to || null,
        table_id: target_table_id || table_id
      })
      .eq("organization_id", organization_id)
      .eq("table_id", table_id)
      .eq("seat_position", seat_from);

    if (error) {
      console.error("MOVE_SEAT_ERROR", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Seat moved successfully"
    });

  } catch (err) {
    console.error("MOVE_SEAT_FATAL", err);

    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
