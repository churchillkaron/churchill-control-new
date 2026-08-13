export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
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
      rows: [],
      roles: [],
      available_roles: [],
      permissions: [],
      grants: [],
      assignments: [],
    },
    {
      status: access.status,
    }
  );
}

function statusFor(message) {
  return String(message || "").toLowerCase().includes("permission denied") ? 403 : 500;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedOrganizationId =
      searchParams.get("organizationId") ||
      searchParams.get("organization_id");

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
      permissionKey: "finance.permissions.view",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const organizationId = access.organizationId;
    const [availableRoles, permissions, grants, assignments] = await Promise.all([
      listFinanceRoles(organizationId),
      listFinancePermissions(organizationId),
      listFinancePermissionGrants(organizationId),
      listUserFinanceRoles({ organizationId }),
    ]);

    const rows = assignments.map((assignment) => ({
      ...assignment,
      name: assignment.user_name || assignment.user_email || "Staff Member",
      title: assignment.user_name || assignment.user_email || "Staff Member",
      status: "ACTIVE",
      permission_bundle:
        assignment.role_name ||
        assignment.role_code ||
        "Finance Role",
    }));

    return NextResponse.json({
      success: true,
      organization_id: organizationId,
      rows,
      roles: rows,
      available_roles: availableRoles,
      permissions,
      grants,
      assignments: rows,
      metrics: {
        roles: availableRoles.length,
        permissions: permissions.length,
        grants: grants.length,
        assignments: rows.length,
      },
    });
  } catch (error) {
    const message = error.message || "Unable to load Finance access";
    return NextResponse.json(
      {
        success: false,
        error: message,
        rows: [],
        roles: [],
        available_roles: [],
        permissions: [],
        grants: [],
        assignments: [],
      },
      {
        status: statusFor(message),
      }
    );
  }
}
