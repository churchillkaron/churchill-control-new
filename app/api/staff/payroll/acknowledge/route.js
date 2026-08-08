import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import acknowledgePayrollRecord from "@/lib/payroll/consolidation/acknowledgePayrollRecord";

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

    const result = await acknowledgePayrollRecord({
      payrollRecordId: body?.payrollRecordId,
      organizationId,
      staffId: staff.id,
      partyId: staff.party_id || null,
      staffName: staff.name || staff.email || "STAFF",
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("PAYROLL_ACKNOWLEDGE_ERROR", error);

    return NextResponse.json(
      { success: false, error: error?.message || "Unable to acknowledge payroll" },
      { status: 400 }
    );
  }
}
