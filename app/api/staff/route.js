export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { staffApiErrorResponse } from "@/lib/people/portal/StaffApiError";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import {
  clockInStaff,
  clockOutStaff,
  loadStaffWorkday,
} from "@/lib/people/workforce/shiftRuntime";
import { requireRecentPasskeyVerification } from "@/lib/people/workforce/passkeyClockInVerification";
import {
  claimClockInExceptionGrants,
  consumeClockInExceptionClaims,
  loadApprovedClockInExceptionGrants,
  releaseClockInExceptionClaims,
} from "@/lib/people/workforce/clockInExceptionApproval";
import { loadOrganizationPolicy } from "@/lib/platform/security/organizationAccessPolicy";
import { requireVerifiedStaffIdentity } from "@/lib/people/workforce/StaffIdentityVerificationRuntime";
import { projectStaffSchedule, projectStaffShift, projectStaffShiftResult } from "@/lib/people/portal/StaffBrowserWorkdayProjection";

function contextError(context) {
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

async function resolveStaffAccess(request) {
  const context = await resolveAuthenticatedStaffContext({ request });

  if (!context.success) {
    return {
      response: contextError(context),
    };
  }

  return context;
}

function grantForTarget(grants, target) {
  return (grants || []).find((grant) => grant.targets?.includes(target)) || null;
}

export async function GET(request) {
  try {
    const context = await resolveStaffAccess(request);
    if (context.response) return context.response;

    const workday = await loadStaffWorkday({
      organizationId: context.organizationId,
      staffId: context.staff.id,
    });

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      availableOrganizationIds:
        context.availableOrganizationIds || [],
      partyId: context.staff.party_id || null,
      staff: {
        id: context.staff.id,
        party_id: context.staff.party_id || null,
        name: context.staff.name || null,
        role: context.staff.role || context.role || null,
        position: context.staff.position || null,
        department: context.staff.department || null,
        profile_picture: context.staff.profile_picture || null,
      },
      timezone: workday.timezone,
      businessDate: workday.businessDate,
      schedule: projectStaffSchedule(workday.schedule),
      openShift: projectStaffShift(workday.openShift),
    });
  } catch (error) {
    console.error("STAFF_GET_ERROR", error);

    return staffApiErrorResponse(error, "Unable to load staff");
  }
}

export async function POST(request) {
  let claimedExceptions = [];
  let context = null;

  try {
    context = await resolveStaffAccess(request);
    if (context.response) return context.response;

    const body = await request.json();
    const action = body?.action;

    if (!action || !["clock_in", "clock_out"].includes(action)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid action",
        },
        { status: 400 }
      );
    }

    let gpsExceptionApproved = false;
    let passkeyExceptionApproved = false;

    if (action === "clock_in") {
      const superAdminBypass =
        String(context.staff?.role || context.role || "").trim().toUpperCase() === "SUPER_ADMIN";

      if (!superAdminBypass) {
        await requireVerifiedStaffIdentity({
          organizationId: context.organizationId,
          staffId: context.staff.id,
        });
      }

      const [policy, approvedGrants] = await Promise.all([
        loadOrganizationPolicy({
          organizationId: context.organizationId,
        }),
        loadApprovedClockInExceptionGrants({
          organizationId: context.organizationId,
          staffId: context.staff.id,
        }),
      ]);

      const passkeyRequired =
        policy?.workforce?.passkey_clock_in_required === true;
      const gpsRequired = policy?.workforce?.gps_clock_in_required === true;

      const passkeyGrant = passkeyRequired
        ? grantForTarget(approvedGrants, "passkey")
        : null;
      const gpsGrant = gpsRequired
        ? grantForTarget(approvedGrants, "gps")
        : null;

      passkeyExceptionApproved = Boolean(passkeyGrant);
      gpsExceptionApproved = Boolean(gpsGrant);

      if (passkeyRequired && !passkeyExceptionApproved) {
        await requireRecentPasskeyVerification({
          userId: context.user.id,
        });
      }

      const grantsToUse = [...new Map(
        [passkeyGrant, gpsGrant]
          .filter(Boolean)
          .map((grant) => [grant.id, grant])
      ).values()];

      if (grantsToUse.length) {
        claimedExceptions = await claimClockInExceptionGrants({
          organizationId: context.organizationId,
          staffId: context.staff.id,
          grantIds: grantsToUse.map((grant) => grant.id),
        });
      }
    }

    const result =
      action === "clock_in"
        ? await clockInStaff({
            organizationId: context.organizationId,
            staff: context.staff,
            location: gpsExceptionApproved ? null : body?.location || null,
            gpsExceptionApproved,
          })
        : await clockOutStaff({
            organizationId: context.organizationId,
            staff: context.staff,
          });

    if (action === "clock_in" && claimedExceptions.length) {
      await consumeClockInExceptionClaims({
        organizationId: context.organizationId,
        staff: context.staff,
        claims: claimedExceptions,
        shiftId: result.shift?.id || null,
      });
    }

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      exceptionVerification: action === "clock_in"
        ? {
            passkey: passkeyExceptionApproved,
            gps: gpsExceptionApproved,
            grantCount: claimedExceptions.length,
          }
        : null,
      ...projectStaffShiftResult(result),
    });
  } catch (error) {
    if (claimedExceptions.length && context?.organizationId && context?.staff?.id) {
      try {
        await releaseClockInExceptionClaims({
          organizationId: context.organizationId,
          staffId: context.staff.id,
          claims: claimedExceptions,
        });
      } catch (releaseError) {
        console.error("CLOCK_IN_EXCEPTION_RELEASE_ERROR", releaseError);
      }
    }

    console.error("STAFF_POST_ERROR", error);

    return staffApiErrorResponse(error, "Unable to update shift");
  }
}
