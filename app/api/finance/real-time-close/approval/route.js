export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { approveRealTimeClose } from "@/lib/finance/period-close/approveRealTimeClose";

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

    const approval = await approveRealTimeClose({
      organizationId: access.organizationId,
      closeCycleId: required(body.closeCycleId || body.close_cycle_id, "close_cycle_id"),
      approvedBy: access.user.id,
      approvalRole: null,
    });

    return NextResponse.json({ success: true, approval });
  } catch (error) {
    const message = error.message || "Real-time close approval failed";
    return NextResponse.json(
      { success: false, message },
      { status: String(message).toLowerCase().includes("permission denied") ? 403 : /required|not found/i.test(message) ? 400 : 500 }
    );
  }
}
