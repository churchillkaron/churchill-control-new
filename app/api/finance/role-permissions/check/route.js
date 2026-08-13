export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkPermission } from "@/lib/finance/security/runtime/FinanceSecurityApplicationService";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = required(
      body.organizationId || body.organization_id,
      "organization_id"
    );

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          allowed: false,
          error: access.error,
        },
        {
          status: access.status,
        }
      );
    }

    const permissionKey = required(
      body.permissionKey ||
        body.permission_key ||
        (body.module && body.action ? `${body.module}.${body.action}` : null),
      "permission_key"
    );

    await checkPermission({
      organizationId: access.organizationId,
      userId: required(access.user?.id, "authenticated user"),
      permissionKey,
      fullAccess: access.permissions?.includes("*") === true,
    });

    return NextResponse.json({
      success: true,
      allowed: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        allowed: false,
        error: error.message,
      },
      {
        status: /required/i.test(error.message || "") ? 400 : 403,
      }
    );
  }
}
