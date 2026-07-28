export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { grantPermission } from "@/lib/finance/security/runtime/FinanceSecurityApplicationService";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

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

export async function POST(request) {
  try {
    const body = await request.json();
    const requestedOrganizationId =
      body.organizationId ||
      body.organization_id;

    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId,
      request,
      requiredPermission: "finance.permissions.grant",
    });

    if (!access.success) {
      return accessError(access);
    }

    const roleId =
      body.roleId ||
      body.role_id ||
      body.role;
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

    if (!permissionKey) {
      return NextResponse.json(
        { success: false, error: "Finance permission required" },
        { status: 400 }
      );
    }

    const result = await grantPermission({
      organizationId: access.organizationId,
      roleId,
      permissionKey,
      grantedBy: access.userId,
    });

    return NextResponse.json({
      success: true,
      data: result,
      row: result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Unable to grant Finance permission",
      },
      {
        status: 500,
      }
    );
  }
}
