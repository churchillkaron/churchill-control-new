export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import {
  listFinancePermissions,
  listFinanceRoles,
} from "@/lib/finance/security/repositories/FinancePermissionRepository";

export async function GET(request) {
  try {
    const organizationId = new URL(request.url).searchParams.get("organizationId");
    const access = await requireOrganizationAccess({ organizationId });
    if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

    const [roles, permissions] = await Promise.all([
      listFinanceRoles(),
      listFinancePermissions(),
    ]);

    const rows = roles.flatMap(role =>
      permissions.map(permission => ({
        id: `${role.id}:${permission.id}`,
        role_id: role.id,
        role_name: role.role_name,
        permission_id: permission.id,
        permission_key: permission.permission_key,
      }))
    );

    return NextResponse.json({ success: true, roles: rows, rows });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
