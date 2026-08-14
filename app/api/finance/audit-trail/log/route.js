export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createAuditLog } from "@/lib/platform/audit/createAuditLog";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";

function statusFor(message) {
  return String(message || "").toLowerCase().includes("permission denied") ? 403 : 500;
}

export async function POST(request) {
  try {
    const body = await request.json();

    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.accounting.manage",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const log = await createAuditLog({
      organizationId: access.organizationId,
      entityType: body.entityType,
      entityId: body.entityId,
      actionType: body.actionType,
      performedBy: access.user?.id,
      performedByName:
        access.user?.email || access.user?.user_metadata?.full_name || "Authenticated User",
      oldData: body.previousData ?? body.oldData ?? null,
      newData: body.newData ?? null,
      metadata: {
        ...(body.metadata || {}),
        moduleName: body.moduleName || body.module_name || "finance",
      },
    });

    return NextResponse.json({ success: true, log });
  } catch (error) {
    const message = error.message || "Audit log creation failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: statusFor(message) }
    );
  }
}
