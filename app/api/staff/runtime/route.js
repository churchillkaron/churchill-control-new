export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import buildPeopleRuntime from "@/lib/people/runtime/PeopleRuntime";
import { loadStaffWorkday } from "@/lib/people/workforce/shiftRuntime";
import { scheduleWindow } from "@/lib/shared/time/organizationTime";

function formatDuration(clockIn) {
  if (!clockIn) return "00:00";

  const start = new Date(clockIn).getTime();
  const diff = Math.max(0, Math.floor((Date.now() - start) / 1000));
  const hours = String(Math.floor(diff / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");

  return `${hours}:${minutes}`;
}

function getShiftStatus({ activeShift, schedule, timezone }) {
  if (activeShift) return "WORKING";
  if (!schedule) return "NO_SHIFT";

  const timing = scheduleWindow({
    shiftDate: schedule.shift_date,
    startTime: schedule.start_time,
    endTime: schedule.end_time,
    timezone,
  });

  if (timing?.start && new Date() > timing.start) {
    return "LATE";
  }

  return "UPCOMING";
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
          availableOrganizationIds:
            context.availableOrganizationIds || [],
        },
        { status: context.status || 403 }
      );
    }

    const { user, staff, organizationId } = context;

    const [workday, latestPayroll] = await Promise.all([
      loadStaffWorkday({
        organizationId,
        staffId: staff.id,
      }),
      supabaseAdmin
        .from("payroll_records")
        .select(
          "id,status,payout_status,payroll_month,final_salary,payment_reference,payout_date"
        )
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
      schedule: workday.schedule,
      activeShift: workday.openShift,
    });

    if (latestPayroll.data?.status) {
      runtime.payrollStatus = latestPayroll.data.status;
    }

    const shiftStatus = getShiftStatus({
      activeShift: workday.openShift,
      schedule: workday.schedule,
      timezone: workday.timezone,
    });

    return NextResponse.json({
      success: true,
      identity: {
        organizationId,
        partyId: staff.party_id || null,
        staffId: staff.id,
        email: user.email || staff.email || null,
        staffName: staff.name || null,
      },
      availableOrganizationIds:
        context.availableOrganizationIds || [],
      staff,
      membership: context.membership || null,
      role: context.role || null,
      permissions: context.permissions || [],
      timezone: workday.timezone,
      businessDate: workday.businessDate,
      schedule: workday.schedule,
      activeShift: workday.openShift,
      latestPayroll: latestPayroll.data || null,
      shiftActive: Boolean(workday.openShift),
      shiftDuration: workday.openShift
        ? formatDuration(workday.openShift.clock_in)
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
    console.error("STAFF_RUNTIME_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message || "Unable to load staff runtime",
      },
      { status: 500 }
    );
  }
}
