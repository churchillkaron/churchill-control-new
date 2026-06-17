export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getStaffIdentity } from "@/lib/messages/getStaffIdentity";
import { rejectApprovalRequest } from "@/lib/shared/approvals/rejectApprovalRequest";

export async function POST(request) {
  try {
    const body = await request.json();

    const staff = await getStaffIdentity();

    if (!staff) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    const result =
      await rejectApprovalRequest({
        workflowRequestId:
          body.workflowRequestId,

        actedBy: {
          id: staff.id,
          role: staff.role,
        },

        reason:
          body.reason ||
          "Rejected",
      });

    return NextResponse.json({
      success: true,
      result,
    });

  } catch (err) {

    console.error(
      "APPROVAL REJECT ERROR:",
      err
    );

    return NextResponse.json(
      {
        success: false,
        error: err.message,
      },
      {
        status: 500,
      }
    );

  }
}
