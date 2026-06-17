export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { executeApproval } from "@/lib/shared/approvals/executeApproval";
import { getStaffIdentity } from "@/lib/messages/getStaffIdentity";

export async function POST(request) {
  try {
    const body = await request.json();

    // Resolve authenticated user server-side
    const staff = await getStaffIdentity();
    if (!staff) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // Use workflowRequestId to resolve tenant internally
    const result = await executeApproval({
      tenantId: body.tenantId,  // tenantId is optional; can be derived from workflowRequest
      workflowRequestId: body.workflowRequestId,
      actedBy: {
        id: staff.id,
        role: staff.role,
      },
      notes: body.notes || null,
    });

    return NextResponse.json({ success: true, result });
  } catch (err) {
    console.error("APPROVAL PROCESS ERROR:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
