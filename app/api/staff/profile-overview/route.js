import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  localDateString,
  resolveOrganizationTimeContext,
} from "@/lib/shared/time/organizationTime";

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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

    const { staff, organizationId } = context;
    const timeContext = await resolveOrganizationTimeContext({ organizationId });
    const businessDate = localDateString(new Date(), timeContext.timezone);
    const scheduleEndDate = addDays(businessDate, 14);

    const [
      partyResult,
      compensationResult,
      payrollResult,
      scheduleResult,
      attendanceResult,
    ] = await Promise.all([
      staff.party_id
        ? supabaseAdmin
            .from("parties")
            .select("*")
            .eq("id", staff.party_id)
            .eq("organization_id", organizationId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabaseAdmin
        .from("employee_compensation_profiles")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("staff_account_id", staff.id)
        .lte("effective_from", businessDate)
        .or(`effective_to.is.null,effective_to.gte.${businessDate}`)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("payroll_records")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("staff_id", staff.id)
        .order("payroll_month", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(24),
      supabaseAdmin
        .from("staff_schedules")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("staff_id", staff.id)
        .gte("shift_date", businessDate)
        .lte("shift_date", scheduleEndDate)
        .order("shift_date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(30),
      supabaseAdmin
        .from("staff_attendance")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("staff_id", staff.id)
        .order("shift_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    for (const result of [
      partyResult,
      compensationResult,
      payrollResult,
      scheduleResult,
      attendanceResult,
    ]) {
      if (result.error) throw result.error;
    }

    const compensation = compensationResult.data
      ? {
          ...compensationResult.data,
          currency_code: compensationResult.data.currency || null,
          configured:
            Number(compensationResult.data.monthly_salary || 0) > 0 ||
            Number(compensationResult.data.hourly_rate || 0) > 0,
        }
      : null;

    return NextResponse.json({
      success: true,
      profile: {
        organizationId,
        availableOrganizationIds: context.availableOrganizationIds || [],
        timezone: timeContext.timezone,
        businessDate,
        staff,
        party: partyResult.data || null,
        compensation,
        payroll: payrollResult.data || [],
        upcomingSchedules: scheduleResult.data || [],
        recentAttendance: attendanceResult.data || [],
      },
    });
  } catch (error) {
    console.error("STAFF_PROFILE_OVERVIEW_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load staff profile",
      },
      { status: 500 }
    );
  }
}
