export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { executeApproval } from "@/lib/shared/approvals/executeApproval";
import { getStaffIdentity } from "@/lib/messages/getStaffIdentity";

export async function POST(request) {
  try {
    const body = await request.json();
    const staff = await getStaffIdentity(request);

    if (!staff?.organizationId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const result = await executeApproval({
      organizationId: staff.organizationId,
      workflowRequestId: body.workflowRequestId,
      actedBy: {
        id: staff.id,
        role: staff.role,
      },
      notes: body.notes || null,
    });

    return NextResponse.json({
      success: true,
      organizationId: staff.organizationId,
      result,
    });
  } catch (error) {
    console.error("APPROVAL PROCESS ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to process approval",
      },
      { status: 500 }
    );
  }
}
