export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import buildPeopleRuntime from "@/lib/people/runtime/PeopleRuntime";

function formatDuration(clockIn) {
  if (!clockIn) return "00:00";

  const start = new Date(clockIn).getTime();
  const diff = Math.max(0, Math.floor((Date.now() - start) / 1000));
  const hours = String(Math.floor(diff / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");

  return `${hours}:${minutes}`;
}

function getTodayDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getShiftStatus({ activeShift, schedule }) {
  if (activeShift) return "WORKING";
  if (!schedule) return "NO_SHIFT";

  const startTime = schedule.start_time || null;
  if (!startTime) return "UPCOMING";

  const shiftStart = new Date(`${getTodayDate()}T${startTime}+07:00`);

  if (!Number.isNaN(shiftStart.getTime()) && new Date() > shiftStart) {
    return "LATE";
  }

  return "UPCOMING";
}

async function loadSchedule({ organizationId, staffId }) {
  const { data, error } = await supabaseAdmin
    .from("staff_schedules")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId)
    .eq("shift_date", getTodayDate())
    .order("start_time", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function loadActiveShift({ organizationId, staffId }) {
  const { data, error } = await supabaseAdmin
    .from("staff_shifts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId)
    .is("clock_out", null)
    .order("clock_in", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function GET(request) {
  try {
    const context = await resolveAuthenticatedStaffContext({ request });

    if (!context.success) {
      return NextResponse.json(
        {
          success: false,
          error: context.error,
          code: context.code,
          availableOrganizationIds: context.availableOrganizationIds || [],
        },
        { status: context.status || 403 }
      );
    }

    const { user, staff, organizationId } = context;

    const [schedule, activeShift, latestPayroll] = await Promise.all([
      loadSchedule({ organizationId, staffId: staff.id }),
      loadActiveShift({ organizationId, staffId: staff.id }),
      supabaseAdmin
        .from("payroll_records")
        .select("id,status,payout_status,payroll_month,final_salary,payment_reference,payout_date")
        .eq("organization_id", organizationId)
        .eq("staff_id", staff.id)
        .order("payroll_month", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (latestPayroll.error) throw latestPayroll.error;

    const runtime = buildPeopleRuntime({
      staff,
      schedule,
      activeShift,
    });

    if (latestPayroll.data?.status) {
      runtime.payrollStatus = latestPayroll.data.status;
    }

    const shiftStatus = getShiftStatus({ activeShift, schedule });

    return NextResponse.json({
      success: true,
      identity: {
        organizationId,
        partyId: staff.party_id || null,
        staffId: staff.id,
        email: user.email || staff.email || null,
        staffName: staff.name || null,
      },
      availableOrganizationIds: context.availableOrganizationIds || [],
      staff,
      membership: context.membership || null,
      role: context.role || null,
      permissions: context.permissions || [],
      schedule,
      activeShift,
      latestPayroll: latestPayroll.data || null,
      shiftActive: Boolean(activeShift),
      shiftDuration: activeShift ? formatDuration(activeShift.clock_in) : "00:00",
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
    console.error("STAFF_RUNTIME_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load staff runtime",
      },
      { status: 500 }
    );
  }
}
