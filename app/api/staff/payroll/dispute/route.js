import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import disputePayrollRecord from "@/lib/payroll/consolidation/disputePayrollRecord";

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

    const result = await disputePayrollRecord({
      payrollRecordId: body?.payrollRecordId,
      organizationId,
      staffId: staff.id,
      partyId: staff.party_id || null,
      staffName: staff.name || staff.email || "STAFF",
      disputeReason: body?.disputeReason,
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("PAYROLL_DISPUTE_ERROR", error);

    return NextResponse.json(
      { success: false, error: error?.message || "Unable to dispute payroll" },
      { status: 400 }
    );
  }
}
