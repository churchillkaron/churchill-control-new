export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  assignRole,
  grantPermission,
} from "@/lib/finance/security/runtime/FinanceSecurityApplicationService";
import { listFinancePermissions } from "@/lib/finance/security/repositories/FinancePermissionRepository";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";

function accessError(access) {
  return NextResponse.json(
    {
      success: false,
      error: access.error,
    },
    {
      status: access.status,
    }
  );
}

function statusFor(message) {
  const normalized = String(message || "").toLowerCase();
  if (normalized.includes("permission denied")) return 403;
  if (
    /required|not found|does not belong|already|unknown finance permission/i.test(
      message || ""
    )
  ) {
    return 400;
  }
  return 500;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const requestedOrganizationId =
      body.organizationId ||
      body.organization_id;

    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId,
      request,
    });

    if (!access.success) {
      return accessError(access);
    }

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.permissions.grant",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const roleId =
      body.roleId ||
      body.role_id ||
      body.role;
    const userId =
      body.userId ||
      body.user_id ||
      null;
    const permissionKey =
      body.permissionKey ||
      body.permission_key ||
      (body.module && body.action
        ? `${body.module}.${body.action}`
        : null);

    if (!roleId) {
      return NextResponse.json(
        { success: false, error: "Finance role required" },
        { status: 400 }
      );
    }

    if (userId) {
      const result = await assignRole({
        organizationId: access.organizationId,
        userId,
        roleId,
        assignedBy: access.user.id,
      });

      return NextResponse.json({
        success: true,
        mode: "role_assignment",
        data: result,
        row: result,
      });
    }

    if (!permissionKey) {
      return NextResponse.json(
        {
          success: false,
          error: "Staff member or Finance permission required",
        },
        { status: 400 }
      );
    }

    const canonicalPermissions = await listFinancePermissions(
      access.organizationId
    );
    const knownPermission = canonicalPermissions.some(
      (permission) => permission.permission_key === permissionKey
    );

    if (!knownPermission) {
      return NextResponse.json(
        { success: false, error: "Unknown Finance permission" },
        { status: 400 }
      );
    }

    const result = await grantPermission({
      organizationId: access.organizationId,
      roleId,
      permissionKey,
      grantedBy: access.user.id,
    });

    return NextResponse.json({
      success: true,
      mode: "permission_grant",
      data: result,
      row: result,
    });
  } catch (error) {
    const message = error.message || "Unable to assign Finance role";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      {
        status: statusFor(message),
      }
    );
  }
}
