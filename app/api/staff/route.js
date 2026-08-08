export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const LATE_THRESHOLD_MINUTES = 10;

function bangkokDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function minutesBetween(startValue, endValue) {
  if (!startValue || !endValue) return 0;
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.round((end - start) / 60000));
}

async function resolveStaffAccess(request) {
  const context = await resolveAuthenticatedStaffContext({ request });

  if (!context.success) {
    return {
      response: NextResponse.json(
        {
          success: false,
          error: context.error,
          code: context.code,
          availableOrganizationIds: context.availableOrganizationIds || [],
        },
        { status: context.status || 403 }
      ),
    };
  }

  return context;
}

async function loadTodaySchedule({ organizationId, staffId }) {
  const { data, error } = await supabaseAdmin
    .from("staff_schedules")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId)
    .eq("shift_date", bangkokDate())
    .order("start_time", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function loadOpenShift({ organizationId, staffId }) {
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
    const context = await resolveStaffAccess(request);
    if (context.response) return context.response;

    const [schedule, openShift] = await Promise.all([
      loadTodaySchedule({
        organizationId: context.organizationId,
        staffId: context.staff.id,
      }),
      loadOpenShift({
        organizationId: context.organizationId,
        staffId: context.staff.id,
      }),
    ]);

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      availableOrganizationIds: context.availableOrganizationIds || [],
      partyId: context.staff.party_id || null,
      staff: context.staff,
      schedule,
      openShift,
    });
  } catch (error) {
    console.error("STAFF_GET_ERROR", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load staff" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const context = await resolveStaffAccess(request);
    if (context.response) return context.response;

    const body = await request.json();
    const action = body?.action;

    if (!action || !["clock_in", "clock_out"].includes(action)) {
      return NextResponse.json(
        { success: false, error: "Invalid action" },
        { status: 400 }
      );
    }

    const { staff, organizationId } = context;

    if (action === "clock_in") {
      const existingShift = await loadOpenShift({
        organizationId,
        staffId: staff.id,
      });

      if (existingShift) {
        return NextResponse.json(
          { success: false, error: "An active shift already exists" },
          { status: 409 }
        );
      }

      const schedule = await loadTodaySchedule({
        organizationId,
        staffId: staff.id,
      });

      const now = new Date();
      let scheduledStart = null;
      let scheduledEnd = null;
      let lateMinutes = 0;
      let isLate = false;

      if (schedule?.start_time) {
        scheduledStart = schedule.start_time;
        scheduledEnd = schedule.end_time || null;

        const shiftStart = new Date(
          `${bangkokDate()}T${schedule.start_time}+07:00`
        );

        const earliestStart = new Date(shiftStart.getTime() - 30 * 60000);

        if (now < earliestStart) {
          return NextResponse.json(
            { success: false, error: "Too early to start shift" },
            { status: 400 }
          );
        }

        lateMinutes = Math.max(
          0,
          Math.floor((now.getTime() - shiftStart.getTime()) / 60000)
        );
        isLate = lateMinutes > LATE_THRESHOLD_MINUTES;
      }

      const { data: shift, error } = await supabaseAdmin
        .from("staff_shifts")
        .insert({
          organization_id: organizationId,
          party_id: staff.party_id || null,
          staff_id: staff.id,
          staff_name: staff.name || staff.email || "Staff",
          staff_role: staff.role || staff.position || "STAFF",
          clock_in: now.toISOString(),
          is_valid: true,
          is_late: isLate,
          late_minutes: lateMinutes,
          penalty_multiplier: 1,
          scheduled_start: scheduledStart,
          scheduled_end: scheduledEnd,
          shift_source: schedule ? "SCHEDULED" : "UNSCHEDULED",
          approval_status: schedule ? "APPROVED" : "PENDING",
          shift_status: "ACTIVE",
        })
        .select("*")
        .single();

      if (error) throw error;

      return NextResponse.json({
        success: true,
        shift,
        late: isLate,
        lateMinutes,
      });
    }

    const openShift = await loadOpenShift({
      organizationId,
      staffId: staff.id,
    });

    if (!openShift) {
      return NextResponse.json(
        { success: false, error: "No open shift found" },
        { status: 400 }
      );
    }

    const clockOut = new Date().toISOString();
    const workedMinutes = minutesBetween(openShift.clock_in, clockOut);
    const scheduledMinutes =
      openShift.scheduled_start && openShift.scheduled_end
        ? minutesBetween(
            `${bangkokDate()}T${openShift.scheduled_start}+07:00`,
            `${bangkokDate()}T${openShift.scheduled_end}+07:00`
          )
        : 0;
    const overtimeMinutes = Math.max(0, workedMinutes - scheduledMinutes);

    const { data: shift, error } = await supabaseAdmin
      .from("staff_shifts")
      .update({
        clock_out: clockOut,
        worked_minutes: workedMinutes,
        overtime_minutes: overtimeMinutes,
        shift_status: "COMPLETED",
      })
      .eq("id", openShift.id)
      .eq("organization_id", organizationId)
      .eq("staff_id", staff.id)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, shift });
  } catch (error) {
    console.error("STAFF_POST_ERROR", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to update shift" },
      { status: 500 }
    );
  }
}
