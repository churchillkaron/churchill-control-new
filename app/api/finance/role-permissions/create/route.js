export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { grantPermission } from "@/lib/finance/security/runtime/FinanceSecurityApplicationService";

export async function POST(req) {
  try {
    const body = await req.json();

    const result = await grantPermission({
      roleId: body.roleId || body.role_id || body.role,
      permissionKey:
        body.permissionKey ||
        body.permission_key ||
        `${body.module}.${body.action}`,
      grantedBy: body.grantedBy || body.userId || "system",
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}
