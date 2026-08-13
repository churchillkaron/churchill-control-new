export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { runRealTimeClose } from "@/lib/finance/period-close/runRealTimeClose";

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
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.close.execute",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const result = await runRealTimeClose({
      organizationId: access.organizationId,
      closeDate: required(body.closeDate || body.close_date, "close_date"),
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    const message = error.message || "Real-time close failed";
    return NextResponse.json(
      { success: false, message },
      { status: String(message).toLowerCase().includes("permission denied") ? 403 : /required/i.test(message) ? 400 : 500 }
    );
  }
}
