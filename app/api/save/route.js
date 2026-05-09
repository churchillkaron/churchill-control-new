import { NextResponse }
from "next/server";

import { supabase }
from "@/lib/supabase";

export async function POST(req) {
  try {
    const body = await req.json();

    const {
      staff,        // ⚠️ legacy support (name OR id depending on old calls)
      staff_name,   // ✅ new
      department,
      score
    } = body;

    // 🔥 REQUIRED VALIDATION
    if (!staff) {
      return NextResponse.json(
        { success: false, error: "Missing staff" },
        { status: 400 }
      );
    }

    if (!department) {
      return NextResponse.json(
        { success: false, error: "Missing department" },
        { status: 400 }
      );
    }

    if (score === undefined || score === null) {
      return NextResponse.json(
        { success: false, error: "Missing score" },
        { status: 400 }
      );
    }

    // 🔥 Normalize identity
    const staff_id = typeof staff === "string" && staff.length > 20 ? staff : null;

    const finalStaffId = staff_id || null;
    const finalStaffName = staff_name || (staff_id ? "unknown" : staff);

    // ❗ enforce ID (like assets)
    if (!finalStaffId) {
      return NextResponse.json(
        { success: false, error: "Missing staff_id (invalid staff value)" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("performance")
      .insert([
        {
          staff_id: finalStaffId,     // ✅ PRIMARY ID
          staff_name: finalStaffName, // ✅ HUMAN READABLE
          department: department,
          score: Number(score),
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      performance: data,
    });

  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}