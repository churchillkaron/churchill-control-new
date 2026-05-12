import { NextResponse } from "next/server";
import { supabase } from "@/lib/shared/supabase/client";

const BASE_REVENUE = 128450;
const LATE_THRESHOLD_MINUTES = 10;
const LATE_PENALTY = 0.8;

function isLate(clockInTime) {
  const start = new Date(clockInTime);
  const scheduled = new Date(start);
  scheduled.setHours(17, 0, 0, 0);

  const diff = (start - scheduled) / 60000;
  return diff > LATE_THRESHOLD_MINUTES;
}

function buildSystemPayload(staffMembers, shifts) {
  const activeStaff = (staffMembers || []).filter((s) => s.is_active !== false);

  const latestShiftByName = {};
  for (const shift of shifts || []) {
    if (!latestShiftByName[shift.staff_name]) {
      latestShiftByName[shift.staff_name] = shift;
    }
  }

  const staffWithShift = activeStaff.map((member) => {
    const shift = latestShiftByName[member.name] || null;

    let shiftMinutes = 0;
    if (shift?.clock_in) {
      const start = new Date(shift.clock_in);
      const end = shift?.clock_out ? new Date(shift.clock_out) : new Date();
      shiftMinutes = Math.max(0, Math.floor((end - start) / 60000));
    }

    return {
      name: member.name,
      role: member.role,
      score: member.score,
      shift,
      shiftMinutes,
    };
  });

  const roleGroups = {
    FOH: staffWithShift.filter((s) => s.role === "FOH"),
    Bar: staffWithShift.filter((s) => s.role === "Bar"),
    Kitchen: staffWithShift.filter((s) => s.role === "Kitchen"),
  };

  const avg = (arr) =>
    arr.length
      ? Math.round(arr.reduce((sum, s) => sum + (s.score || 0), 0) / arr.length)
      : 0;

  const fohScore = avg(roleGroups.FOH);
  const barScore = avg(roleGroups.Bar);
  const kitchenScore = avg(roleGroups.Kitchen);
  const averageScore = Math.round((fohScore + barScore + kitchenScore) / 3);

  const revenue = BASE_REVENUE;
  const servicePool = Math.round(revenue * 0.05);

  let payoutStatus = "GOOD";
  let payoutLevel = 100;

  if (averageScore < 70) {
    payoutStatus = "WARNING";
    payoutLevel = 70;
  }
  if (averageScore < 60) {
    payoutStatus = "BAD";
    payoutLevel = 40;
  }
  if (averageScore < 50) {
    payoutStatus = "CRITICAL";
    payoutLevel = 0;
  }

  const payoutPool = Math.round((servicePool * payoutLevel) / 100);

  const roleSplit = {
    FOH: 0.5,
    Bar: 0.3,
    Kitchen: 0.2,
  };

  const staffWithPayout = staffWithShift.map((member) => {
    const group = roleGroups[member.role] || [];
    const totalScore = group.reduce((sum, s) => sum + (s.score || 0), 0);
    const rolePool = payoutPool * (roleSplit[member.role] || 0);

    let fullPayoutShare = 0;
    if (group.length > 0 && totalScore > 0) {
      fullPayoutShare = Math.round((member.score / totalScore) * rolePool);
    }

    const fullShiftMinutes = 8 * 60;
    const validShift = !!member.shift?.is_valid && member.shiftMinutes > 0;
    const workedRatio = Math.min(member.shiftMinutes / fullShiftMinutes, 1);

    const penalty = member.shift?.penalty_multiplier || 1;

    const payrollAmount = validShift
      ? Math.round(fullPayoutShare * workedRatio * penalty)
      : 0;

    return {
      ...member,
      fullPayoutShare,
      payrollAmount,
      validShift,
    };
  });

  return {
    revenue,
    servicePool,
    payoutPool,
    payoutStatus,
    payoutLevel,
    fohScore,
    barScore,
    kitchenScore,
    averageScore,
    staffWithPayout,
  };
}

export async function GET() {
  const { data: staffMembers } = await supabase
    .from("staff_members")
    .select("*");

  const { data: shifts } = await supabase
    .from("staff_shifts")
    .select("*")
    .order("created_at", { ascending: false });

  const payload = buildSystemPayload(staffMembers, shifts);
  return NextResponse.json(payload);
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
      penalty_multiplier: late ? LATE_PENALTY : 1,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, late });
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