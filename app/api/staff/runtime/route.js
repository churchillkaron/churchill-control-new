export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/shared/supabase/server";
import buildStaffRuntime from "@/lib/runtime/core/buildStaffRuntime";

function formatDuration(clockIn) {
  if (!clockIn) return "00:00";

  const start = new Date(clockIn).getTime();
  const diff = Math.max(0, Math.floor((Date.now() - start) / 1000));

  const hours = String(Math.floor(diff / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");

  return `${hours}:${minutes}`;
}

function getTodayDate() {
  return new Date().toISOString().split("T")[0];
}

function getShiftStatus({ activeShift, schedule }) {
  if (activeShift) return "WORKING";
  if (!schedule) return "NO_SHIFT";

  const today = getTodayDate();
  const now = new Date();
  const shiftStart = new Date(`${today}T${schedule.start_time}`);

  if (now > shiftStart) return "LATE";

  return "UPCOMING";
}

export async function GET(request) {
  try {
    const supabase = createServerSupabase();

    const { searchParams } = new URL(request.url);

    const tenantId = searchParams.get("tenant_id");
    const email = searchParams.get("email");
    const staffName = searchParams.get("staff_name");

    if (!email && !staffName) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing email or staff_name",
        },
        { status: 400 }
      );
    }

    const today = getTodayDate();

    let staffQuery = supabase
      .from("staff_accounts")
      .select("*");

    if (tenantId) {
      staffQuery = staffQuery.eq("tenant_id", tenantId);
    }

    if (email) {
      staffQuery = staffQuery.eq("email", email);
    } else {
      staffQuery = staffQuery.eq("name", staffName);
    }

    const { data: staffAccount, error: staffError } =
      await staffQuery.maybeSingle();

    const resolvedStaffName =
      staffAccount?.name || staffName;

    const resolvedTenantId =
      staffAccount?.tenant_id || tenantId;

    if (!resolvedStaffName) {
      return NextResponse.json(
        {
          success: false,
          error: "Staff identity not found",
        },
        { status: 404 }
      );
    }

    let scheduleQuery = supabase
      .from("staff_schedules")
      .select("*")
      .eq("staff_name", resolvedStaffName)
      .eq("shift_date", today);

    if (resolvedTenantId) {
      scheduleQuery = scheduleQuery.eq("tenant_id", resolvedTenantId);
    }

    const { data: schedule } =
      await scheduleQuery.maybeSingle();

    let activeShiftQuery = supabase
      .from("staff_shifts")
      .select("*")
      .eq("staff_name", resolvedStaffName)
      .is("clock_out", null)
      .order("clock_in", { ascending: false })
      .limit(1);

    if (resolvedTenantId) {
      activeShiftQuery = activeShiftQuery.eq("tenant_id", resolvedTenantId);
    }

    const { data: activeShift } =
      await activeShiftQuery.maybeSingle();




    const runtime = buildStaffRuntime({
      staff: staffAccount || {
        name: resolvedStaffName,
      },
      schedule,
      activeShift,
    });

    const shiftStatus = getShiftStatus({
      activeShift,
      schedule,
    });

    return NextResponse.json({
      success: true,
      identity: {
        tenantId: resolvedTenantId,
        email: staffAccount?.email || email || null,
        staffName: resolvedStaffName,
        staffId: staffAccount?.id || null,
      },
      staff: staffAccount,
      schedule,
      activeShift,
      shiftActive: !!activeShift,
      shiftDuration: activeShift
        ? formatDuration(activeShift.clock_in)
        : "00:00",
      shiftStatus,
      runtime,
      socialFeed: [
        {
          type: "shift",
          title: runtime.shiftStatus,
          message: runtime.nextShift || "No upcoming shift",
        },
      ],
      aiInsight: `Workforce runtime active. Payroll status: ${runtime.payrollStatus}.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
