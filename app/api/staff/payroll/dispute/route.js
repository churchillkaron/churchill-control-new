import { NextResponse } from "next/server";
import { staffApiErrorResponse } from "@/lib/people/portal/StaffApiError";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { disputePayrollRecord } from "@/lib/people/payroll";

export async function POST(request) {
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

    const body = await request.json();
    const { staff, organizationId } = context;

    await disputePayrollRecord({
      payrollRecordId: body?.payrollRecordId,
      organizationId,
      staffId: staff.id,
      partyId: staff.party_id || null,
      staffName: staff.name || staff.email || "STAFF",
      disputeReason: body?.disputeReason,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PAYROLL_DISPUTE_ERROR", error);

    return staffApiErrorResponse(error, "Unable to dispute payroll");
  }
}
