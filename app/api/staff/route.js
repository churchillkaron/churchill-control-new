import { NextResponse } from "next/server";
import { supabase } from "../../../lib/integrations/supabase";

const LATE_THRESHOLD_MINUTES = 10;

function isLate(clockInTime) {
  const start = new Date(clockInTime);
  const scheduled = new Date(start);
  scheduled.setHours(17, 0, 0, 0); // example: 17:00 shift start

  const diff = (start - scheduled) / 60000;
  return diff > LATE_THRESHOLD_MINUTES;
}

export async function POST(request) {
  const body = await request.json();
  const { action, staffName, staffRole } = body;

  if (!staffName || !staffRole) {
    return NextResponse.json(
      { error: "Missing staffName or staffRole" },
      { status: 400 }
    );
  }

  if (action === "clock_in") {
    const now = new Date().toISOString();

    const late = isLate(now);

    const { error } = await supabase.from("staff_shifts").insert({
      staff_name: staffName,
      staff_role: staffRole,
      clock_in: now,
      is_valid: true,
      is_late: late,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      late,
    });
  }

  if (action === "clock_out") {
    const { data: openShift } = await supabase
      .from("staff_shifts")
      .select("*")
      .eq("staff_name", staffName)
      .is("clock_out", null)
      .limit(1)
      .maybeSingle();

    if (!openShift) {
      return NextResponse.json(
        { error: "No open shift found" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("staff_shifts")
      .update({ clock_out: new Date().toISOString() })
      .eq("id", openShift.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}