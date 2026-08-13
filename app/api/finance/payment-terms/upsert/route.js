export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { upsertPaymentTermCommand } from "@/lib/finance/payment-terms/runtime/PaymentTermsApplicationService";

function statusFor(error) {
  const message = String(error?.message || "");
  if (message.toLowerCase().includes("permission denied")) return 403;
  return /required|access|membership|authentication/i.test(message) ? 400 : 500;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organization_id || body.organizationId,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.configuration.manage",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const values = { ...body };
    delete values.organization_id;
    delete values.organizationId;
    delete values.tenant_id;
    delete values.tenantId;

    const result = await upsertPaymentTermCommand({
      organization_id: access.organizationId,
      values,
    });

    return NextResponse.json({
      success: true,
      paymentTerm: result,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Payment term upsert failed" },
      { status: statusFor(error) }
    );
  }
}
