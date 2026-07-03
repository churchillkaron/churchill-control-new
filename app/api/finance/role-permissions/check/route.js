export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { checkPermission } from "@/lib/finance/security/runtime/FinanceSecurityApplicationService";

export async function POST(req) {
  try {
    const body = await req.json();

    await checkPermission({
      userId: body.userId || body.user_id || "system",
      permissionKey:
        body.permissionKey ||
        body.permission_key ||
        `${body.module}.${body.action}`,
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
        status: 403,
      }
    );
  }
}
