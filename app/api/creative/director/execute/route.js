export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  CreativeDirectorRuntime,
} from "@/lib/creative/director/runtime/CreativeDirectorRuntime";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

function errorStatus(error) {
  const code = String(error?.code || "").toUpperCase();
  if (code.includes("REQUIRED") || code.includes("INVALID")) return 400;
  if (code.includes("PERMISSION") || code.includes("FORBIDDEN")) return 403;
  if (code.includes("NOT_FOUND")) return 404;
  if (code.includes("CONFLICT") || code.includes("LOCK")) return 409;
  return 500;
}

export async function POST(req) {
  try {
    const body = await req.json();

    const access = await requireOrganizationAccess({
      organizationId: body.organization_id,
      request: req,
      requiredAnyPermission: [
        "creative.execute",
        "creative.production.run",
        "creative.*",
      ],
    });

    if (!access.success) {
      return NextResponse.json(access, {
        status: access.status,
      });
    }

    const result = await CreativeDirectorRuntime.execute({
      ...body,
      organization_id: access.organization_id,
      requested_by_user_id: access.userId,
      requested_by_staff_account_id: access.access?.staffAccountId || null,
      execution_access: {
        authenticated: true,
        role: access.role || null,
        permissions: access.permissions || [],
      },
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error?.message || "Creative director execution failed",
      code: error?.code || null,
    }, {
      status: errorStatus(error),
    });
  }
}
