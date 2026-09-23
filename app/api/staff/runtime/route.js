export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import buildPeopleRuntime from "@/lib/people/runtime/PeopleRuntime";
import {
  loadClockInRequirements,
  loadStaffWorkday,
} from "@/lib/people/workforce/shiftRuntime";
import { loadStaffPasskeyStatus } from "@/lib/people/workforce/passkeyClockInVerification";
import { loadClockInExceptionState } from "@/lib/people/workforce/clockInExceptionApproval";
import { loadOrganizationPolicy } from "@/lib/platform/security/organizationAccessPolicy";
import { loadStaffIdentityVerification } from "@/lib/people/workforce/StaffIdentityVerificationRuntime";
import { scheduleWindow } from "@/lib/shared/time/organizationTime";
import { projectStaffSchedule, projectStaffShift } from "@/lib/people/portal/StaffBrowserWorkdayProjection";
import { projectStaffClockInExceptionState } from "@/lib/people/portal/StaffClockInExceptionProjection";
import { staffApiErrorResponse } from "@/lib/people/portal/StaffApiError";

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

    const [
      workday,
      locationRequirements,
      organizationPolicy,
      passkeyStatus,
      clockInExceptionState,
      identityVerification,
    ] = await Promise.all([
      loadStaffWorkday({
        organizationId,
        staffId: staff.id,
      }),
      loadClockInRequirements({ organizationId }),
      loadOrganizationPolicy({ organizationId }),
      loadStaffPasskeyStatus({ userId: user.id }),
      loadClockInExceptionState({
        organizationId,
        staffId: staff.id,
      }),
      loadStaffIdentityVerification({ organizationId, staffId: staff.id }),
    ]);

    const runtime = buildPeopleRuntime({
      staff,
      schedule: workday.schedule,
      activeShift: workday.openShift,
    });

    const shiftStatus = getShiftStatus({
      activeShift: workday.openShift,
      schedule: workday.schedule,
      timezone: workday.timezone,
    });

    const publicClockInExceptionState = projectStaffClockInExceptionState(clockInExceptionState);
    const superAdminBypass =
      String(staff.role || context.role || "").trim().toUpperCase() === "SUPER_ADMIN";

    const clockInRequirements = {
      gpsRequired: locationRequirements.gpsRequired === true,
      passkeyRequired:
        organizationPolicy?.workforce?.passkey_clock_in_required === true,
      passkeyEnrolled: passkeyStatus.enrolled,
      identityRequired: !superAdminBypass,
      identityVerified: superAdminBypass ? true : identityVerification.verified,
      identityStatus: superAdminBypass ? "BYPASSED" : identityVerification.status,
      exception: {
        latest: publicClockInExceptionState.latest,
        activeApprovedTargets: publicClockInExceptionState.activeApprovedTargets,
        pendingTargets: publicClockInExceptionState.pendingTargets,
      },
    };

    return NextResponse.json({
      success: true,
      staff: {
        name: staff.name || null,
        role: staff.role || context.role || null,
        department: staff.department || null,
      },
      role: context.role || null,
      timezone: workday.timezone,
      businessDate: workday.businessDate,
      schedule: projectStaffSchedule(workday.schedule),
      activeShift: projectStaffShift(workday.openShift),
      shiftActive: Boolean(workday.openShift),
      shiftDuration: workday.openShift
        ? formatDuration(workday.openShift.clock_in)
        : "00:00",
      shiftStatus,
      clockInRequirements,
      clockInExceptionState: publicClockInExceptionState,
      runtime,
      socialFeed: [
        {
          type: "shift",
          title: runtime.shiftStatus,
          message: runtime.nextShift || "No upcoming shift",
        },
      ],
    });
  } catch (error) {
    console.error("STAFF_RUNTIME_ERROR", error);
    return staffApiErrorResponse(error, "Unable to load staff runtime");
  }
}
