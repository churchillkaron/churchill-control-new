export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import {
  listFinancePermissionGrants,
  listFinancePermissions,
  listFinanceRoles,
  listUserFinanceRoles,
} from "@/lib/finance/security/repositories/FinancePermissionRepository";

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

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedOrganizationId =
      searchParams.get("organizationId") ||
      searchParams.get("organization_id");

    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId,
    });

    if (!access.success) {
      return accessError(access);
    }

    const organizationId = access.organizationId;

    const [roles, permissions, rows, assignments] = await Promise.all([
      listFinanceRoles(organizationId),
      listFinancePermissions(organizationId),
      listFinancePermissionGrants(organizationId),
      listUserFinanceRoles({ organizationId }),
    ]);

    return NextResponse.json({
      success: true,
      organization_id: organizationId,
      rows,
      roles,
      permissions,
      assignments,
      metrics: {
        roles: roles.length,
        permissions: permissions.length,
        grants: rows.length,
        assignments: assignments.length,
      },
    });
  } catch (error) {
    console.error("FINANCE PERMISSION LIST ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Unable to load Finance permissions",
      },
      {
        status: 500,
      }
    );
  }
}
