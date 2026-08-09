export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getStaffIdentity } from "@/lib/messages/getStaffIdentity";
import { rejectApprovalRequest } from "@/lib/shared/approvals/rejectApprovalRequest";

export async function POST(request) {
  try {
    const body = await request.json();
    const staff = await getStaffIdentity(request);

    if (!staff?.organizationId) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    const result = await rejectApprovalRequest({
      organizationId: staff.organizationId,
      workflowRequestId: body.workflowRequestId,
      actedBy: {
        id: staff.id,
        role: staff.role,
      },
      reason: body.reason || "Rejected",
    });

    return NextResponse.json({
      success: true,
      organizationId: staff.organizationId,
      result,
    });
  } catch (error) {
    console.error("APPROVAL REJECT ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to reject approval",
      },
      { status: 500 }
    );
  }
}
