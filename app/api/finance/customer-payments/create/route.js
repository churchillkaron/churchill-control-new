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

    const idempotencyKey = String(
      body.idempotency_key ||
      body.idempotencyKey ||
      request.headers.get("idempotency-key") ||
      ""
    ).trim();

    if (!idempotencyKey) {
      return NextResponse.json(
        { success: false, error: "idempotency_key required" },
        { status: 400 }
      );
    }

    const result = await postCustomerPaymentCommand({
      ...body,
      organization_id: access.organizationId,
      paid_by: access.user?.id || body.paid_by || null,
      idempotency_key: idempotencyKey,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error.message || "Customer payment failed";

    return NextResponse.json(
      { success: false, error: message },
      {
        status:
          /required|greater than|exceeds|match|idempotency/i.test(message)
            ? 400
            : 500,
      }
    );
  }
}
