export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/shared/auth";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  partsInTimezone,
  resolveOrganizationTimeContext,
  scheduleWindow,
} from "@/lib/shared/time/organizationTime";
import {
  evaluateScheduleAvailability,
  loadAvailabilityForScheduleRange,
} from "@/lib/people/workforce/workforceAvailabilityRuntime";

function validDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function localWindowPart(date, timezone) {
  const parts = partsInTimezone(date, timezone);
  return {
    date: `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`,
    time: `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`,
  };
}

function publishedShiftEvidence({ staffId, schedules, scheduledStart, scheduledEnd, timezone }) {
  if (!scheduledStart || !scheduledEnd) {
    return {
      status: "NOT_EVALUATED",
      covered: null,
      schedule_id: null,
      reason: "No assignment window supplied.",
    };
  }

  const staffSchedules = schedules.filter((row) => row.staff_id === staffId);
  if (!staffSchedules.length) {
    return {
      status: "NO_PUBLISHED_SHIFT",
      covered: null,
      schedule_id: null,
      reason: "No published People shift covers this date.",
    };
  }

  const covering = staffSchedules.find((row) => {
    const window = scheduleWindow({
      shiftDate: row.shift_date,
      startTime: row.start_time,
      endTime: row.end_time,
      timezone,
    });
    return window?.start && window?.end
      && window.start.getTime() <= scheduledStart.getTime()
      && window.end.getTime() >= scheduledEnd.getTime();
  });

  if (covering) {
    return {
      status: "COVERED",
      covered: true,
      schedule_id: covering.id,
      reason: null,
    };
  }

  return {
    status: "OUTSIDE_PUBLISHED_SHIFT",
    covered: false,
    schedule_id: null,
    reason: "The visit falls outside this person’s published People shift.",
  };
}

export async function GET(req) {
  try {
    await requireAuth();

    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("organizationId");
    const scheduledStart = validDate(searchParams.get("scheduledStart"));
    const scheduledEnd = validDate(searchParams.get("scheduledEnd"));

    if (Boolean(scheduledStart) !== Boolean(scheduledEnd)) {
      return NextResponse.json({
        success: false,
        error: "scheduledStart and scheduledEnd must be supplied together.",
      }, { status: 400 });
    }

    if (scheduledStart && scheduledEnd && scheduledEnd <= scheduledStart) {
      return NextResponse.json({
        success: false,
        error: "scheduledEnd must be after scheduledStart.",
      }, { status: 400 });
    }

    const access = await requireOrganizationAccess({ organizationId });
    if (!access.success) {
      return NextResponse.json({
        success: false,
        error: access.error,
      }, { status: access.status });
    }

    const { data, error } = await supabaseAdmin
      .from("staff_accounts")
      .select("id,name,role,position,department,party_id")
      .eq("active_organization_id", access.organizationId)
      .eq("active", true);

    if (error) throw error;

    const users = data || [];
    const partyIds = users.map((user) => user.party_id).filter(Boolean);
    const staffIds = users.map((user) => user.id).filter(Boolean);

    const { data: parties, error: partiesError } = partyIds.length
      ? await supabaseAdmin
          .from("parties")
          .select("id,display_name")
          .eq("organization_id", access.organizationId)
          .in("id", partyIds)
      : { data: [], error: null };

    if (partiesError) throw partiesError;

    const partyMap = Object.fromEntries(
      (parties || []).map((party) => [party.id, party.display_name])
    );

    let timezone = null;
    let appointment = null;
    let availabilityPatterns = [];
    let availabilityExceptions = [];
    let schedules = [];

    if (scheduledStart && scheduledEnd && staffIds.length) {
      const timeContext = await resolveOrganizationTimeContext({
        organizationId: access.organizationId,
      });
      timezone = timeContext.timezone;

      const localStart = localWindowPart(scheduledStart, timezone);
      const localEnd = localWindowPart(scheduledEnd, timezone);
      appointment = {
        scheduled_start: scheduledStart.toISOString(),
        scheduled_end: scheduledEnd.toISOString(),
        timezone,
        local_date: localStart.date,
        local_start_time: localStart.time,
        local_end_time: localEnd.time,
      };

      const availability = await loadAvailabilityForScheduleRange({
        organizationId: access.organizationId,
        staffIds,
        startDate: localStart.date,
        endDate: localEnd.date,
      });
      availabilityPatterns = availability.patterns;
      availabilityExceptions = availability.exceptions;

      const { data: scheduleRows, error: scheduleError } = await supabaseAdmin
        .from("staff_schedules")
        .select("id,staff_id,shift_date,start_time,end_time,status")
        .eq("organization_id", access.organizationId)
        .eq("status", "PUBLISHED")
        .in("staff_id", staffIds)
        .gte("shift_date", localStart.date)
        .lte("shift_date", localEnd.date);

      if (scheduleError) throw scheduleError;
      schedules = scheduleRows || [];
    }

    return NextResponse.json({
      success: true,
      appointment,
      users: users.map((user) => {
        let workforceAvailability = {
          status: "NOT_EVALUATED",
          available: null,
          reason: "No assignment window supplied.",
          source_type: null,
          source_id: null,
        };
        let publishedShift = {
          status: "NOT_EVALUATED",
          covered: null,
          schedule_id: null,
          reason: "No assignment window supplied.",
        };

        if (appointment) {
          const evaluation = evaluateScheduleAvailability({
            staffId: user.id,
            shiftDate: appointment.local_date,
            startTime: appointment.local_start_time,
            endTime: appointment.local_end_time,
            patterns: availabilityPatterns,
            exceptions: availabilityExceptions,
          });

          workforceAvailability = {
            status: evaluation.conflict ? "UNAVAILABLE" : "AVAILABLE",
            available: !evaluation.conflict,
            reason: evaluation.reason || null,
            source_type: evaluation.sourceType || null,
            source_id: evaluation.sourceId || null,
          };

          publishedShift = publishedShiftEvidence({
            staffId: user.id,
            schedules,
            scheduledStart,
            scheduledEnd,
            timezone,
          });
        }

        return {
          staff_id: user.id,
          party_id: user.party_id,
          name: partyMap[user.party_id] || user.name,
          role: user.role,
          position: user.position,
          department: user.department,
          workforce_availability: workforceAvailability,
          published_shift: publishedShift,
          dispatch_readiness: appointment
            ? (
                workforceAvailability.available === false
                  ? "BLOCKED_UNAVAILABLE"
                  : publishedShift.covered === false
                    ? "BLOCKED_OUTSIDE_SHIFT"
                    : publishedShift.covered === true
                      ? "AVAILABLE"
                      : "AVAILABILITY_UNVERIFIED"
              )
            : "NOT_EVALUATED",
        };
      }),
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: error.status || 500 });
  }
}
