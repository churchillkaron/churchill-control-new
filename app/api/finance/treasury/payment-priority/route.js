export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { runPaymentPriorityQueueCommand } from "@/lib/finance/payments/runtime/FinancePaymentApplicationService";

function statusFor(message) {
  const normalized = String(message || "").toLowerCase();
  if (normalized.includes("permission denied")) return 403;
  return /required|invalid/i.test(normalized) ? 400 : 500;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
    });

    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.banking.manage",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const result = await runPaymentPriorityQueueCommand({
      organization_id: access.organizationId,
      entity_id: body.entity_id || body.entityId,
      invoices: Array.isArray(body.invoices) ? body.invoices : [],
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error.message || "Payment priority refresh failed";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}
