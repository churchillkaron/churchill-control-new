export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { getRealTimeCloseExceptions } from "@/lib/finance/period-close/getRealTimeCloseExceptions";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = required(body.organizationId || body.organization_id, "organization_id");
    const access = await requireOrganizationAccess({ organizationId, request });

    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error, exceptions: [] }, { status: access.status });
    }

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.accounting.view",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const exceptions = await getRealTimeCloseExceptions({
      organizationId: access.organizationId,
    });

    return NextResponse.json({ success: true, exceptions });
  } catch (error) {
    const message = error.message || "Real-time close exceptions load failed";
    return NextResponse.json(
      { success: false, message, exceptions: [] },
      { status: String(message).toLowerCase().includes("permission denied") ? 403 : /required/i.test(message) ? 400 : 500 }
    );
  }
}
