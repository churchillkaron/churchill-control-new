export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { postCustomerPaymentCommand } from "@/lib/finance/accounts-receivable/runtime/AccountsReceivableApplicationService";

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const result = await postCustomerPaymentCommand({
      ...body,
      organization_id: access.organizationId,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || "Customer payment failed" },
      { status: 500 }
    );
  }
}
