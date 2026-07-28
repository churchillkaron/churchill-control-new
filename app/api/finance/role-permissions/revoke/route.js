export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { revokeFinanceRoleAssignmentRecord } from "@/lib/finance/security/repositories/FinanceRoleAssignmentRepository";

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
      requiredPermission: "finance.permissions.grant",
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const assignmentId = body.assignmentId || body.assignment_id || body.id;
    const revoked = await revokeFinanceRoleAssignmentRecord({
      organizationId: access.organizationId,
      assignmentId,
      revokedBy: access.userId,
    });

    return NextResponse.json({
      success: true,
      message: "Finance access revoked",
      revoked,
    });
  } catch (error) {
    const message = error?.message || "Unable to revoke Finance access";
    return NextResponse.json(
      { success: false, error: message },
      { status: /required|not found/i.test(message) ? 400 : 500 }
    );
  }
}
